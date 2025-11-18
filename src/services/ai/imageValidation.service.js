const ClarifaiService = require('./clarifai.service');
const CategoryMappingService = require('./categoryMapping.service');
const CloudinaryService = require('../cloudinary/cloudinary.service');
const Category = require('../../models/Category');

class ImageValidationService {
  /**
   * Check if image contains inappropriate content and upload to Cloudinary
   * @param {Buffer} imageBuffer - Image buffer
   * @returns {Object} Upload result with AI analysis
   */
  static async checkInappropriateContent(imageBuffer) {
    try {
      // Use workflow to analyze image (includes NSFW detection)
      const analysisResults = await ClarifaiService.analyzeImageWithWorkflow(imageBuffer);

      // Check NSFW results - STRICT checking
      if (!analysisResults.nsfwDetection.safe) {
        throw new Error(
          `Image contains inappropriate content (NSFW confidence: ${(analysisResults.nsfwDetection.nsfwValue * 100).toFixed(1)}%)`
        );
      }

      // Upload to Cloudinary after safety check passes
      const uploadResult = await CloudinaryService.uploadImage(imageBuffer);

      // Return upload result with analysis data
      return {
        ...uploadResult,
        aiAnalysis: analysisResults
      };
    } catch (error) {

      // If NSFW check fails, re-throw the error (don't upload)
      if (error.message.includes('inappropriate content') || error.message.includes('NSFW')) {
        throw error;
      }

      // For other AI errors, try to upload without validation (fallback)

      try {
        const uploadResult = await CloudinaryService.uploadImage(imageBuffer);
        // Mark that AI validation was skipped so later category check can allow the image
        return {
          ...uploadResult,
          aiAnalysis: {
            nsfwDetection: { safe: true, nsfwValue: 0, note: 'Validation skipped due to AI error' },
            conceptDetection: { concepts: [] },
            validationSkipped: true
          }
        };
      } catch (uploadError) {
        throw new Error(`Failed to upload image: ${uploadError.message}`);
      }
    }
  }

  /**
   * Validate if image matches the selected category
   * @param {Buffer} imageBuffer - Image buffer
   * @param {string} categoryId - Category ID
   * @param {Object} existingAnalysis - Existing AI analysis (optional)
   * @returns {Object} Validation result
   */
  static async validateImageCategory(imageBuffer, categoryId, existingAnalysis = null) {
    try {

      const category = await Category.findById(categoryId);
      if (!category) {
        throw new Error('Category not found');
      }

      // Use existing analysis if available, otherwise analyze image
      let analysisResults = existingAnalysis;
      if (!analysisResults) {
        analysisResults = await ClarifaiService.analyzeImageWithWorkflow(imageBuffer);
      }

      // If AI validation was explicitly skipped (e.g., Clarifai unavailable), allow image
      if (analysisResults && analysisResults.validationSkipped) {
        return {
          isRelevant: true,
          detectedObjects: analysisResults.conceptDetection?.concepts || [],
          detectedLabels: analysisResults.conceptDetection?.concepts || [],
          confidence: 'LOW',
          matchedKeywords: [],
          matchScore: 0,
          matchPercentage: 0,
          note: 'Validation skipped by AI; accepted by fallback'
        };
      }

      const detectedConcepts = analysisResults.conceptDetection.concepts || [];

      // Get category keywords with safe fallback
      let categoryKeywords = [];
      try {
        categoryKeywords = CategoryMappingService.getCategoryKeywords(category.name.toLowerCase());
      } catch (keywordError) {
      
        categoryKeywords = [];
      }

      // Ensure categoryKeywords is an array
      if (!Array.isArray(categoryKeywords)) {
        categoryKeywords = [];
      }

 

      // Perform strict matching
      const matchingResult = this.performStrictMatching(
        categoryKeywords,
        detectedConcepts,
        category.name
      );

      return matchingResult;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Process multiple images with validation
   * @param {Array} files - Array of file objects
   * @param {string} categoryId - Category ID
   * @returns {Array} Upload results
   */
  static async uploadAndValidateImages(files, categoryId) {
    try {
      if (!files || files.length === 0) {
        throw new Error('No files provided for upload');
      }

      const uploadResults = [];
      const validationErrors = [];

      // Process each image
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileName = file.originalname;

        try {
         

          // Step 1: Check inappropriate content and upload if safe
          const uploadResult = await this.checkInappropriateContent(file.buffer);

          // Step 2: Validate category relevance using existing analysis
          const categoryValidation = await this.validateImageCategory(
            file.buffer,
            categoryId,
            uploadResult.aiAnalysis
          );

          // If category validation fails, delete the uploaded image and add to errors
          if (!categoryValidation.isRelevant) {
          

            // Delete from Cloudinary
            try {
              await CloudinaryService.deleteImage(uploadResult.public_id);
            } catch (deleteError) {
            
            }

            validationErrors.push({
              imageIndex: i + 1,
              filename: fileName,
              type: 'CATEGORY_MISMATCH',
              reason: `Image does not match selected category`,
              expected: categoryValidation.detectedObjects || [],
              detected: categoryValidation.detectedLabels || [],
              confidence: categoryValidation.confidence,
              matchScore: categoryValidation.matchScore
            });
            continue;
          }

          // Add successful result
          uploadResults.push({
            url: uploadResult.secure_url,
            publicId: uploadResult.public_id,
            alt: `Product image ${i + 1}`,
            isMain: i === 0,
            nsfwCheck: {
              safe: uploadResult.aiAnalysis.nsfwDetection.safe,
              nsfwValue: uploadResult.aiAnalysis.nsfwDetection.nsfwValue
            },
            categoryValidation: categoryValidation
          });

        } catch (error) {
    

          // Determine error type
          let errorType = 'PROCESSING_ERROR';
          if (error.message.includes('inappropriate content') || error.message.includes('NSFW')) {
            errorType = 'NSFW_VIOLATION';
          } else if (
            error.message.includes('Category not found') ||
            error.message.includes('category')
          ) {
            errorType = 'CATEGORY_MISMATCH';
          }

          validationErrors.push({
            imageIndex: i + 1,
            filename: fileName,
            type: errorType,
            reason: error.message.includes('inappropriate content')
              ? 'Image contains inappropriate content'
              : error.message,
            error: error.message.includes('NSFW confidence')
              ? error.message.match(/NSFW confidence: ([\d.]+%)/)?.[0]
              : error.message
          });
        }
      }

      // If any validation errors occurred, throw with details
      if (validationErrors.length > 0) {
        // Clean up any successfully uploaded images
        for (const result of uploadResults) {
          try {
            await CloudinaryService.deleteImage(result.publicId);
          } catch (cleanupError) {
            console.warn('Failed to cleanup uploaded image:', cleanupError.message);
          }
        }

        // Create detailed error message
        const nsfwErrors = validationErrors.filter((e) => e.type === 'NSFW_VIOLATION');
        const categoryErrors = validationErrors.filter((e) => e.type === 'CATEGORY_MISMATCH');
        const processingErrors = validationErrors.filter((e) => e.type === 'PROCESSING_ERROR');

        let errorMessage = `Image validation failed for ${validationErrors.length} out of ${files.length} images.\n`;

        if (nsfwErrors.length > 0) {
          errorMessage += `\n🔞 Inappropriate Content Violations (${nsfwErrors.length}):\n`;
          nsfwErrors.forEach((error) => {
            errorMessage += `• Image ${error.imageIndex} (${error.filename}): ${error.reason}\n`;
            if (error.error) {
              errorMessage += `  Details: ${error.error}\n`;
            }
          });
        }

        if (categoryErrors.length > 0) {
          // Get category name for display
          const category = await Category.findById(categoryId);
          const categoryName = category ? category.name : 'Unknown Category';

          errorMessage += `\n📂 Category Mismatch Violations (${categoryErrors.length}):\n`;
          errorMessage += `Selected category: "${categoryName}"\n\n`;
          categoryErrors.forEach((error) => {
            errorMessage += `• Image ${error.imageIndex} (${error.filename}): ${error.reason}\n`;
            if (error.expected && error.detected) {
              errorMessage += `  Expected: ${error.expected.slice(0, 5).join(', ')}\n`;
              errorMessage += `  Detected: ${error.detected.slice(0, 5).join(', ')}\n`;
              errorMessage += `  Match score: ${error.matchScore} (${error.confidence})\n`;
            }
          });
        }

        if (processingErrors.length > 0) {
          errorMessage += `\n⚠️ Processing Errors (${processingErrors.length}):\n`;
          processingErrors.forEach((error) => {
            errorMessage += `• Image ${error.imageIndex} (${error.filename}): ${error.reason}\n`;
          });
        }

        const error = new Error(errorMessage);
        error.validationErrors = validationErrors;
        error.errorBreakdown = {
          nsfw: nsfwErrors.length,
          category: categoryErrors.length,
          processing: processingErrors.length,
          total: validationErrors.length
        };
        throw error;
      }

    
      return uploadResults;
    } catch (error) {
      console.error('Upload and validation error:', error);
      throw error;
    }
  }

  /**
   * Perform strict matching between keywords and detected concepts
   * @param {Array} categoryKeywords - Expected keywords
   * @param {Array} detectedConcepts - Detected concepts
   * @param {string} categoryName - Category name
   * @returns {Object} Matching result
   */
  static performStrictMatching(categoryKeywords, detectedConcepts, categoryName) {
    let matchScore = 0;
    let exactMatches = [];
    let semanticMatches = [];
    let vietnameseMatches = [];

    // Safe fallback for undefined or null values
    const safeCategoryKeywords = Array.isArray(categoryKeywords) ? categoryKeywords : [];
    const safeDetectedConcepts = Array.isArray(detectedConcepts) ? detectedConcepts : [];


    if (safeDetectedConcepts.length === 0 || safeCategoryKeywords.length === 0) {
      return this.createFailureResult(safeDetectedConcepts);
    }

    // 1. EXACT MATCHES (Score: 5 points each)
    for (const keyword of safeCategoryKeywords) {
      if (!keyword || typeof keyword !== 'string') continue;

      for (const concept of safeDetectedConcepts) {
        // Fix: Handle both string and object formats
        const conceptName = typeof concept === 'string' ? concept : concept?.name || '';

        if (!conceptName || typeof conceptName !== 'string') continue;

        if (conceptName.toLowerCase() === keyword.toLowerCase()) {
          exactMatches.push({ keyword, concept: conceptName, confidence: concept.value || 0 });
          matchScore += 5;
          break;
        }
      }
    }

    // 2. CONTAINS MATCHES (Score: 3 points each)
    for (const keyword of safeCategoryKeywords) {
      if (!keyword || typeof keyword !== 'string') continue;
      if (exactMatches.some((m) => m.keyword.toLowerCase() === keyword.toLowerCase())) continue;

      for (const concept of safeDetectedConcepts) {
        // Fix: Handle both string and object formats
        const conceptName = typeof concept === 'string' ? concept : concept?.name || '';

        if (!conceptName || typeof conceptName !== 'string') continue;

        if (
          conceptName.toLowerCase().includes(keyword.toLowerCase()) ||
          keyword.toLowerCase().includes(conceptName.toLowerCase())
        ) {
          semanticMatches.push({ keyword, concept: conceptName, confidence: concept.value || 0 });
          matchScore += 3;
          break;
        }
      }
    }

    // 3. SEMANTIC MATCHES (Score: 2 points each)
    const semanticMappings = {
      laptop: ['computer', 'notebook', 'macbook', 'pc'],
      bag: ['backpack', 'handbag', 'purse', 'satchel'],
      camera: ['photography', 'lens', 'dslr'],
      phone: ['smartphone', 'mobile', 'iphone', 'android']
    };

    for (const keyword of safeCategoryKeywords) {
      if (!keyword || typeof keyword !== 'string') continue;
      if (
        exactMatches.some((m) => m.keyword.toLowerCase() === keyword.toLowerCase()) ||
        semanticMatches.some((m) => m.keyword.toLowerCase() === keyword.toLowerCase())
      )
        continue;

      const relatedTerms = semanticMappings[keyword.toLowerCase()] || [];
      for (const concept of safeDetectedConcepts) {
        // Fix: Handle both string and object formats
        const conceptName = typeof concept === 'string' ? concept : concept?.name || '';

        if (!conceptName || typeof conceptName !== 'string') continue;

        if (relatedTerms.includes(conceptName.toLowerCase())) {
          semanticMatches.push({ keyword, concept: conceptName, confidence: concept.value || 0 });
          matchScore += 2;
          break;
        }
      }
    }

    return this.evaluateMatchingScore(
      matchScore,
      safeCategoryKeywords,
      safeDetectedConcepts,
      exactMatches,
      semanticMatches,
      vietnameseMatches,
      categoryName
    );
  }

  /**
   * Evaluate matching score and determine result
   * @param {number} matchScore - Total match score
   * @param {Array} categoryKeywords - Expected keywords
   * @param {Array} detectedConcepts - Detected concepts
   * @param {Array} exactMatches - Exact matches
   * @param {Array} semanticMatches - Semantic matches
   * @param {Array} vietnameseMatches - Vietnamese matches
   * @param {string} categoryName - Category name
   * @returns {Object} Evaluation result
   */
  static evaluateMatchingScore(
    matchScore,
    categoryKeywords,
    detectedConcepts,
    exactMatches,
    semanticMatches,
    vietnameseMatches,
    categoryName
  ) {
    const safeCategoryKeywords = Array.isArray(categoryKeywords) ? categoryKeywords : [];
    const safeDetectedConcepts = Array.isArray(detectedConcepts) ? detectedConcepts : [];

    const maxPossibleScore = safeCategoryKeywords.length * 5;
    const matchPercentage = (matchScore / Math.max(maxPossibleScore, 5)) * 100;

  

    // STRICT DECISION LOGIC
    let isRelevant = false;
    let confidence = 'LOW';

    if (matchScore >= 5) {
      isRelevant = true;
      if (matchScore >= 10) confidence = 'HIGH';
      else if (matchScore >= 7) confidence = 'MEDIUM';
      else confidence = 'LOW';
    }

    const allMatches = [...exactMatches, ...semanticMatches, ...vietnameseMatches];

    if (!isRelevant) {
      // Log rejection reason
    } else {
      // Log acceptance details
    }

    return {
      isRelevant,
      detectedObjects: safeDetectedConcepts.slice(0, 8),
      detectedLabels: safeDetectedConcepts.slice(0, 8),
      confidence,
      matchedKeywords: allMatches,
      matchScore,
      matchPercentage: parseFloat(matchPercentage.toFixed(1)),
      matchBreakdown: {
        exact: exactMatches,
        semantic: semanticMatches,
        vietnamese: vietnameseMatches
      }
    };
  }

  /**
   * Create failure result when no matching possible
   * @param {Array} detectedConcepts - Detected concepts
   * @returns {Object} Failure result
   */
  static createFailureResult(detectedConcepts) {
    const safeConcepts = Array.isArray(detectedConcepts) ? detectedConcepts : [];

    return {
      isRelevant: false,
      detectedObjects: safeConcepts.length > 0 ? safeConcepts : ['no-concepts'],
      detectedLabels: safeConcepts.length > 0 ? safeConcepts : ['no-concepts'],
      confidence: 'LOW',
      note: 'No concepts detected or keywords unavailable',
      matchScore: 0,
      matchPercentage: 0,
      modelUsed: 'fallback-strict'
    };
  }
}

module.exports = ImageValidationService;
