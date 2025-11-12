const Review = require('../models/Review');
const mongoose = require('mongoose');
const cloudinary = require('../config/cloudinary');

// Helper to upload array of files (from multer memoryStorage)
async function uploadFilesToCloudinary(files = []) {
	if (!files || !files.length) return [];
	const uploaded = [];
	for (const file of files) {
		// file.buffer available because multer.memoryStorage()
		const result = await cloudinary.uploader.upload_stream_async
			? cloudinary.uploader.upload_stream_async({ resource_type: 'image' }, file.buffer)
			: await new Promise((resolve, reject) => {
					const stream = cloudinary.uploader.upload_stream({ resource_type: 'image' }, (error, res) => {
						if (error) return reject(error);
						resolve(res);
					});
					stream.end(file.buffer);
				});
		uploaded.push(result.secure_url || result.url);
	}
	return uploaded;
}

// Create review
exports.createReview = async (req, res) => {
	try {
		const { order, product, reviewee, type, rating, title, comment, detailedRating } = req.body;
		const files = req.files || [];
		// Basic required checks (order optional for testing)
			// type normalization: accept 'product'|'user' or enum values
			const typeMap = {
				product: 'PRODUCT_REVIEW',
				user: 'USER_REVIEW',
				PRODUCT_REVIEW: 'PRODUCT_REVIEW',
				USER_REVIEW: 'USER_REVIEW'
			};

			const normalizedType = typeMap[type] || null;

			// Basic required checks (order/product/reviewee optional for testing)
			if (!normalizedType || !rating || !comment) {
				return res.status(400).json({ message: 'Thiếu dữ liệu bắt buộc (type, rating, comment)' });
			}

		// Upload images
		let photos = [];
		try {
			photos = await uploadFilesToCloudinary(files);
		} catch (err) {
			console.error('Cloudinary upload error', err);
			return res.status(500).json({ message: 'Lỗi upload ảnh' });
		}

		// Only set ObjectId fields if they are valid ObjectId strings
		const safeOrder = order && mongoose.Types.ObjectId.isValid(order) ? order : undefined;
		const safeProduct = product && mongoose.Types.ObjectId.isValid(product) ? product : undefined;
		const safeReviewee = reviewee && mongoose.Types.ObjectId.isValid(reviewee) ? reviewee : undefined;

		const reviewData = {
			reviewer: req.user?._id || req.body.reviewer,
			type: normalizedType,
			rating: Number(rating),
			title,
			comment,
			photos,
			detailedRating: detailedRating ? JSON.parse(detailedRating) : undefined,
			status: 'APPROVED'
		};

		// If the client indicated a target role (OWNER/SHIPPER) but no valid reviewee
		// was provided, persist the intended role so listings can surface it for UX.
		const targetRole = req.body.targetRole;
		if (normalizedType === 'USER_REVIEW' && !safeReviewee && (targetRole === 'OWNER' || targetRole === 'SHIPPER')) {
			reviewData.intendedFor = targetRole;
		}

		if (safeOrder) reviewData.order = safeOrder;
		if (safeProduct) reviewData.product = safeProduct;
		if (safeReviewee) reviewData.reviewee = safeReviewee;

		const review = new Review(reviewData);
		await review.save();

		// Optionally update product metrics (simple increment)
		try {
			const Product = require('../models/Product');
			await Product.findByIdAndUpdate(product, { $inc: { 'metrics.reviewCount': 1 } });
		} catch (e) {
			// ignore
		}

		return res.json({ data: review });
	} catch (err) {
		console.error('createReview error', err);
		return res.status(500).json({ message: 'Internal server error', error: err.message });
	}
};

// Update review
exports.updateReview = async (req, res) => {
	try {
		const { id } = req.params;
		const review = await Review.findById(id);
		if (!review) return res.status(404).json({ message: 'Không tìm thấy đánh giá' });

		// Only reviewer can update if user authenticated; otherwise allow for testing
		if (req.user && review.reviewer && review.reviewer.toString() !== req.user._id.toString()) {
			return res.status(403).json({ message: 'Không có quyền chỉnh sửa' });
		}

		const { rating, title, comment, detailedRating } = req.body;
		if (rating) review.rating = Number(rating);
		if (title !== undefined) review.title = title;
		if (comment !== undefined) review.comment = comment;
		if (detailedRating) review.detailedRating = JSON.parse(detailedRating);

		// Handle new uploads
		const files = req.files || [];
		if (files.length) {
			const photos = await uploadFilesToCloudinary(files);
			review.photos = review.photos.concat(photos);
		}

		await review.save();
		return res.json({ data: review });
	} catch (err) {
		console.error('updateReview error', err);
		return res.status(500).json({ message: 'Internal server error', error: err.message });
	}
};

// Delete review
exports.deleteReview = async (req, res) => {
	try {
		const { id } = req.params;
		const review = await Review.findById(id);
		if (!review) return res.status(404).json({ message: 'Không tìm thấy đánh giá' });

		// Reviewer or admin can delete; if no authenticated user, allow delete for testing
		if (req.user) {
			const isOwner = review.reviewer && (review.reviewer.toString() === req.user._id.toString());
			const isAdmin = req.user && (req.user.role === 'admin');
			if (!isOwner && !isAdmin) return res.status(403).json({ message: 'Không có quyền xóa' });
		}

		// Use findByIdAndDelete to avoid calling instance.remove (some mongoose setups return plain objects)
		await Review.findByIdAndDelete(id);

		// Optionally decrement product metrics if present
		try {
			if (review.product) {
				const Product = require('../models/Product');
				await Product.findByIdAndUpdate(review.product, { $inc: { 'metrics.reviewCount': -1 } });
			}
		} catch (e) {
			// ignore metric update errors
		}

		return res.json({ message: 'Xóa đánh giá thành công' });
	} catch (err) {
		console.error('deleteReview error', err);
		return res.status(500).json({ message: 'Internal server error', error: err.message });
	}
};

// Reply to review (response from reviewee)
exports.replyToReview = async (req, res) => {
	try {
		const { id } = req.params;
		const { comment } = req.body;
		const files = req.files || [];
		if (!comment) return res.status(400).json({ message: 'Thiếu nội dung trả lời' });
		const review = await Review.findById(id);
		if (!review) return res.status(404).json({ message: 'Không tìm thấy đánh giá' });

		// Only reviewee (owner/shipper being reviewed) can reply when authenticated; otherwise allow for testing
		if (req.user) {
			if (!review.reviewee || review.reviewee.toString() !== req.user._id.toString()) {
				return res.status(403).json({ message: 'Không có quyền trả lời' });
			}
		}

		const commenter = req.user?._id || req.body.commenter;
		const parentResponseId = req.body.parentResponseId || req.body.parentId;

		// upload files (if any) and attach photos to the response
		let photos = [];
		if (files.length) {
			try {
				photos = await uploadFilesToCloudinary(files);
			} catch (err) {
				console.error('Cloudinary upload error for response', err);
				return res.status(500).json({ message: 'Lỗi upload ảnh phản hồi' });
			}
		}

		const newResponse = {
			commenter,
			comment,
			photos,
			respondedAt: new Date(),
			responses: []
		};

		review.responses = review.responses || [];

		// If parentResponseId provided, find nested response and push into its responses
		if (parentResponseId) {
			const found = findResponseRecursive(review.responses, parentResponseId);
			if (!found) return res.status(404).json({ message: 'Không tìm thấy phản hồi cha' });
			found.response.responses = found.response.responses || [];
			found.response.responses.push(newResponse);
		} else {
			review.responses.push(newResponse);
		}

		await review.save();
		return res.json({ data: review });
	} catch (err) {
		console.error('replyToReview error', err);
		return res.status(500).json({ message: 'Internal server error', error: err.message });
	}
};

// Helper: recursively find a response by id within nested responses
function findResponseRecursive(responsesArray = [], responseId) {
	if (!responsesArray || !responsesArray.length) return null;
	for (let i = 0; i < responsesArray.length; i++) {
		const r = responsesArray[i];
		if (r && r._id && r._id.toString() === responseId.toString()) {
			return { parentArray: responsesArray, index: i, response: r };
		}
		if (r.responses && r.responses.length) {
			const found = findResponseRecursive(r.responses, responseId);
			if (found) return found;
		}
	}
	return null;
}

// Reply to a specific response (nested reply)
exports.replyToResponse = async (req, res) => {
	try {
		const { id, responseId } = req.params;
		const { comment } = req.body;
		const files = req.files || [];
		if (!comment) return res.status(400).json({ message: 'Thiếu nội dung trả lời' });
		const review = await Review.findById(id);
		if (!review) return res.status(404).json({ message: 'Không tìm thấy đánh giá' });

		const commenter = req.user?._id || req.body.commenter;
		// upload photos (if present)
		let photos = [];
		if (files.length) {
			try {
				photos = await uploadFilesToCloudinary(files);
			} catch (err) {
				console.error('Cloudinary upload error for nested response', err);
				return res.status(500).json({ message: 'Lỗi upload ảnh phản hồi' });
			}
		}

		const newResponse = { commenter, comment, photos, respondedAt: new Date(), responses: [] };

		const found = findResponseRecursive(review.responses || [], responseId);
		if (!found) return res.status(404).json({ message: 'Không tìm thấy phản hồi để trả lời' });

		// Permission: allow if reviewer or admin or testing mode
		// if (req.user && found.response.commenter && found.response.commenter.toString() !== req.user._id.toString()) {
		//     // only allow owner of the response or admin to reply to it in strict mode
		// }

		found.response.responses = found.response.responses || [];
		found.response.responses.push(newResponse);
		await review.save();
		return res.json({ data: review });
	} catch (err) {
		console.error('replyToResponse error', err);
		return res.status(500).json({ message: 'Internal server error', error: err.message });
	}
};

// Update a nested response
exports.updateResponse = async (req, res) => {
	try {
		const { id, responseId } = req.params;
		const { comment } = req.body;
		const files = req.files || [];
		const review = await Review.findById(id);
		if (!review) return res.status(404).json({ message: 'Không tìm thấy đánh giá' });

		const found = findResponseRecursive(review.responses || [], responseId);
		if (!found) return res.status(404).json({ message: 'Không tìm thấy phản hồi' });

		// Permission: only commenter or admin can edit (relaxed for testing)
		if (req.user && found.response.commenter && found.response.commenter.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
			return res.status(403).json({ message: 'Không có quyền chỉnh sửa phản hồi' });
		}

		if (comment !== undefined) {
			found.response.comment = comment;
			found.response.editedAt = new Date();
		}

		// handle new uploaded photos for this response (append)
		if (files.length) {
			try {
				const photos = await uploadFilesToCloudinary(files);
				found.response.photos = found.response.photos && found.response.photos.length ? found.response.photos.concat(photos) : photos;
			} catch (err) {
				console.error('Cloudinary upload error while updating response', err);
				return res.status(500).json({ message: 'Lỗi upload ảnh khi cập nhật phản hồi' });
			}
		}

		await review.save();
		return res.json({ data: review });
	} catch (err) {
		console.error('updateResponse error', err);
		return res.status(500).json({ message: 'Internal server error', error: err.message });
	}
};

// Delete a nested response
exports.deleteResponse = async (req, res) => {
	try {
		const { id, responseId } = req.params;
		const review = await Review.findById(id);
		if (!review) return res.status(404).json({ message: 'Không tìm thấy đánh giá' });
		// Permission: find the response first to check permission
		const found = findResponseRecursive(review.responses || [], responseId);
		if (!found) return res.status(404).json({ message: 'Không tìm thấy phản hồi' });

		if (req.user && found.response.commenter && found.response.commenter.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
			return res.status(403).json({ message: 'Không có quyền xóa phản hồi' });
		}

		// Remove the response and its nested children by filtering recursively
		function removeResponseById(arr = [], idToRemove) {
			if (!arr || !arr.length) return [];
			return arr.reduce((acc, r) => {
				const rid = r._id && r._id.toString ? r._id.toString() : String(r._id);
				if (rid === idToRemove.toString()) {
					// skip this node (and therefore its nested children) -> effectively delete subtree
					return acc;
				}
				// otherwise, recurse into its children
				const childResponses = r.responses && r.responses.length ? removeResponseById(r.responses, idToRemove) : [];
				acc.push({ ...r, responses: childResponses });
				return acc;
			}, []);
		}

		review.responses = removeResponseById(review.responses || [], responseId);
		await review.save();
		return res.json({ message: 'Xóa phản hồi thành công' });
	} catch (err) {
		console.error('deleteResponse error', err);
		return res.status(500).json({ message: 'Internal server error', error: err.message });
	}
};

// Increment helpfulness
exports.incrementHelpfulness = async (req, res) => {
	try {
		const { id } = req.params;
		const { type, userId, target = 'review', responseId } = req.body; // 'helpful' or 'notHelpful', target: 'review'|'response'
		const review = await Review.findById(id);
		if (!review) return res.status(404).json({ message: 'Không tìm thấy đánh giá' });

		// Determine acting user
		const actor = req.user?._id || userId;

		// ensure top-level structures exist
		review.helpfulness = review.helpfulness || { helpful: 0, notHelpful: 0 };
		review.likedBy = review.likedBy || [];

		// Handle toggling/helpfulness for review or a nested response
		if (target === 'response') {
			// find the response by id if provided, otherwise pick the last leaf response
			let resp = null;
			if (responseId) {
				const found = findResponseRecursive(review.responses || [], responseId);
				if (!found) return res.status(404).json({ message: 'Không tìm thấy phản hồi' });
				resp = found.response;
			} else {
				let arr = review.responses || [];
				if (!arr.length) return res.status(404).json({ message: 'Không tìm thấy phản hồi' });
				let current = arr[arr.length - 1];
				while (current && current.responses && current.responses.length) {
					current = current.responses[current.responses.length - 1];
				}
				resp = current;
			}

			// ensure response helpfulness and likedBy exist
			resp.helpfulness = resp.helpfulness || { helpful: 0, notHelpful: 0 };
			resp.likedBy = resp.likedBy || [];

			if (type === 'helpful') {
				if (!actor) {
					resp.helpfulness.helpful = (resp.helpfulness.helpful || 0) + 1;
				} else {
					const idx = (resp.likedBy || []).findIndex((u) => u.toString() === actor.toString());
					if (idx === -1) {
						resp.likedBy.push(actor);
						resp.helpfulness.helpful = (resp.helpfulness.helpful || 0) + 1;
					} else {
						resp.likedBy.splice(idx, 1);
						resp.helpfulness.helpful = Math.max(0, (resp.helpfulness.helpful || 0) - 1);
					}
				}
			} else {
				resp.helpfulness.notHelpful = (resp.helpfulness.notHelpful || 0) + 1;
			}
		} else {
			// operate on top-level review
			if (type === 'helpful') {
				review.likedBy = review.likedBy || [];
				if (!actor) {
					review.helpfulness.helpful = (review.helpfulness.helpful || 0) + 1;
				} else {
					const idx = (review.likedBy || []).findIndex((u) => u.toString() === actor.toString());
					if (idx === -1) {
						review.likedBy.push(actor);
						review.helpfulness.helpful = (review.helpfulness.helpful || 0) + 1;
					} else {
						review.likedBy.splice(idx, 1);
						review.helpfulness.helpful = Math.max(0, (review.helpfulness.helpful || 0) - 1);
					}
				}
			} else {
				review.helpfulness.notHelpful = (review.helpfulness.notHelpful || 0) + 1;
			}
		}

		await review.save();
		return res.json({ data: review });
	} catch (err) {
		console.error('incrementHelpfulness error', err);
		return res.status(500).json({ message: 'Internal server error', error: err.message });
	}
};

// Get reviews for product (with pagination)
exports.getReviewsByProduct = async (req, res) => {
	try {
		const { productId } = req.params;
		const page = Number(req.query.page || 1);
		const limit = Number(req.query.limit || 20);
		const skip = (page - 1) * limit;

		// support optional filtering by target (PRODUCT | OWNER | SHIPPER) and reviewee id
		const target = req.query.target; // expected values: 'PRODUCT','OWNER','SHIPPER'
		const reviewee = req.query.reviewee; // optional user id to filter user reviews

		const query = { product: productId, status: 'APPROVED' };

		if (target) {
			if (target === 'PRODUCT') {
				query.type = 'PRODUCT_REVIEW';
			} else if (target === 'OWNER' || target === 'SHIPPER') {
				// owner/shipper are user reviews; ensure we filter by the correct
				// reviewee (owner or shipper). If the client provided a valid
				// reviewee param, use it. Otherwise try to derive the reviewee from
				// the product document (product.owner for OWNER, product.shipper for SHIPPER).
				query.type = 'USER_REVIEW';
				if (reviewee && mongoose.Types.ObjectId.isValid(reviewee)) {
					query.reviewee = reviewee;
				} else {
					// attempt to load the product to pick the appropriate reviewee
					const Product = require('../models/Product');
					const prod = await Product.findById(productId).lean();
					if (!prod) {
						// if product not found, return empty
						return res.json({ data: [], pagination: { page, limit, total: 0 } });
					}
					if (target === 'OWNER') {
						if (prod.owner) query.reviewee = prod.owner;
						else return res.json({ data: [], pagination: { page, limit, total: 0 } });
					} else if (target === 'SHIPPER') {
						if (prod.shipper) query.reviewee = prod.shipper;
						else {
							// No shipper assigned yet: include reviews that were created with intendedFor='SHIPPER'
							query.$or = [ { intendedFor: 'SHIPPER' } ];
						}
					}
				}
			}
		}

	// prevent conditional caching (ETag/If-None-Match) for this endpoint
	res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');

	const total = await Review.countDocuments(query);
		const items = await Review.find(query)
			.populate('reviewer', 'name avatar profile')
			.populate('reviewee', 'name avatar profile')
			.sort({ createdAt: -1 })
			.skip(skip)
			.limit(limit);

		res.json({ data: items, pagination: { page, limit, total } });
	} catch (err) {
		console.error('getReviewsByProduct error', err);
		return res.status(500).json({ message: 'Internal server error', error: err.message });
	}
};

// Admin helper: migrate user reviews for a product that have no reviewee -> set to product.shipper
// This helps when reviews were created for a shipper but the reviewee field was not set.
exports.fixShipperReviews = async (req, res) => {
	try {
		const { productId } = req.params;
		const Product = require('../models/Product');
		const product = await Product.findById(productId).lean();
		if (!product) return res.status(404).json({ message: 'Product not found' });
		if (!product.shipper) return res.status(400).json({ message: 'Product has no shipper assigned' });

		const shipperId = product.shipper;
		const result = await Review.updateMany(
			{ product: productId, type: 'USER_REVIEW', $or: [ { reviewee: { $exists: false } }, { reviewee: null } ] },
			{ $set: { reviewee: shipperId } }
		);
		return res.json({ message: 'Fixed shipper reviews', modifiedCount: result.nModified || result.modifiedCount || 0 });
	} catch (err) {
		console.error('fixShipperReviews error', err);
		return res.status(500).json({ message: 'Internal server error', error: err.message });
	}
};

