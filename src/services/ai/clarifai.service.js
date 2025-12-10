const { ClarifaiStub, grpc } = require('clarifai-nodejs-grpc');

// Initialize Clarifai
const stub = ClarifaiStub.grpc();
const metadata = new grpc.Metadata();
metadata.set('authorization', 'Key ' + process.env.CLARIFAI_API_KEY);

// Clarifai configuration
const CLARIFAI_CONFIG = {
  USER_ID: '7xa2qgjd7nea',
  APP_ID: 'image-moderation-16122003',
  WORKFLOW_ID: 'kiemtra-hinhanh-with-categroy'
};

class ClarifaiService {
  /**
   * Analyze image using Clarifai Workflow
   * @param {Buffer} imageBuffer - Image buffer
   * @returns {Object} Analysis results
   */
  static async analyzeImageWithWorkflow(imageBuffer) {
    try {
      const base64Image = imageBuffer.toString('base64');

      const workflowRequest = {
        user_app_id: {
          user_id: CLARIFAI_CONFIG.USER_ID,
          app_id: CLARIFAI_CONFIG.APP_ID
        },
        workflow_id: CLARIFAI_CONFIG.WORKFLOW_ID,
        inputs: [
          {
            data: {
              image: {
                base64: base64Image
              }
            }
          }
        ]
      };

      const workflowResponse = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Workflow request timeout after 30 seconds'));
        }, 30000);

        stub.PostWorkflowResults(workflowRequest, metadata, (err, response) => {
          clearTimeout(timeout);
          if (err) {
            console.error('Clarifai Workflow error:', err.message);
            reject(err);
          } else {
            resolve(response);
          }
        });
      });

      // Check if response is successful
      if (workflowResponse.status.code !== 10000) {
        console.error('Workflow failed:', workflowResponse.status.description);
        throw new Error(`Clarifai Workflow error: ${workflowResponse.status.description}`);
      }

      return this.processWorkflowResults(workflowResponse);
    } catch (error) {
      console.error('Workflow analysis error:', error);
      throw error;
    }
  }

  /**
   * Process Clarifai workflow results
   * @param {Object} workflowResponse - Raw workflow response
   * @returns {Object} Processed analysis results
   */
  static processWorkflowResults(workflowResponse) {
    const results = workflowResponse.results[0];
    const analysisResults = {
      nsfwDetection: { safe: true, confidence: 0 },
      conceptDetection: { concepts: [], confidence: 0 },
      modelResults: []
    };

    for (const output of results.outputs) {
      const model = output.model;

      if (output.data && output.data.concepts) {
        const concepts = output.data.concepts.filter((concept) => concept.value > 0.5);

        // Process NSFW model
        if (model.id.includes('nsfw') || model.id.includes('moderation')) {
          analysisResults.nsfwDetection = this.processNSFWResults(concepts);
        }

        // Process general recognition model
        if (model.id.includes('general') || model.id.includes('recognition')) {
          analysisResults.conceptDetection = this.processConceptResults(concepts);
        }

        // Store all model results
        analysisResults.modelResults.push({
          modelId: model.id,
          modelName: model.name,
          concepts: concepts.map((c) => ({
            name: c.name.toLowerCase(),
            value: c.value
          }))
        });
      }
    }

    return analysisResults;
  }

  /**
   * Process NSFW detection results
   * @param {Array} concepts - NSFW concepts
   * @returns {Object} NSFW detection result
   */
  static processNSFWResults(concepts) {
    const nsfwConcept = concepts.find((concept) => concept.name.toLowerCase() === 'nsfw');
    const safeConcept = concepts.find((concept) => concept.name.toLowerCase() === 'sfw');

    // STRICT NSFW checking - threshold 0.5 (50%)
    const nsfwValue = nsfwConcept ? nsfwConcept.value : 0;
    const safeValue = safeConcept ? safeConcept.value : 1;
    const isSafe = nsfwValue < 0.5; // Strict threshold

    const result = {
      safe: isSafe,
      confidence: Math.max(nsfwValue, safeValue),
      nsfwValue: nsfwValue,
      safeValue: safeValue,
      threshold: 0.5
    };

    if (!result.safe) {
      console.warn(
        `⚠️ NSFW VIOLATION: Image flagged as inappropriate (NSFW: ${(nsfwValue * 100).toFixed(1)}%)`
      );
    }

    return result;
  }

  /**
   * Process concept detection results
   * @param {Array} concepts - Detected concepts
   * @returns {Object} Concept detection result
   */
  static processConceptResults(concepts) {
    const result = {
      concepts: concepts.map((c) => c.name.toLowerCase()),
      confidence: concepts.length > 0 ? concepts[0].value : 0,
      rawConcepts: concepts
    };

    return result;
  }

  /**
   * Get Clarifai configuration
   * @returns {Object} Configuration object
   */
  static getConfig() {
    return CLARIFAI_CONFIG;
  }
}

module.exports = ClarifaiService;
