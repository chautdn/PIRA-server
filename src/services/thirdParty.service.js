const mongoose = require('mongoose');
const Dispute = require('../models/Dispute');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const SystemWallet = require('../models/SystemWallet');
const Transaction = require('../models/Transaction');
const SubOrder = require('../models/SubOrder');
const notificationService = require('./notification.service');

class ThirdPartyService {
  /**
   * Helper: Tạo query tìm dispute theo _id hoặc disputeId
   */
  _buildDisputeQuery(disputeId) {
    return mongoose.Types.ObjectId.isValid(disputeId) && disputeId.length === 24
      ? { _id: disputeId }
      : { disputeId };
  }
  /**
   * Chuyển dispute sang bên thứ 3
   * @param {String} disputeId - ID của dispute
   * @param {String} adminId - ID của admin
   * @param {Object} thirdPartyInfo - Thông tin bên thứ 3
   * @returns {Promise<Dispute>}
   */
  async escalateToThirdParty(disputeId, adminId, thirdPartyInfo) {
    const dispute = await Dispute.findOne(this._buildDisputeQuery(disputeId));
    if (!dispute) {
      throw new Error('Dispute không tồn tại');
    }

    if (dispute.status !== 'NEGOTIATION_FAILED') {
      throw new Error('Chỉ có thể chuyển bên thứ 3 khi đàm phán thất bại');
    }

    // Kiểm tra admin role
    const admin = await User.findById(adminId);
    if (!admin || admin.role !== 'ADMIN') {
      throw new Error('Chỉ admin mới có quyền chuyển sang bên thứ 3');
    }

    // Cập nhật status
    dispute.status = 'THIRD_PARTY_ESCALATED';
    
    // Tính deadline (7 ngày)
    const evidenceDeadline = new Date();
    evidenceDeadline.setDate(evidenceDeadline.getDate() + 7);
    
    dispute.thirdPartyResolution = {
      escalatedAt: new Date(),
      escalatedBy: adminId,
      evidenceDeadline,
      thirdPartyInfo: {
        name: thirdPartyInfo.name || '',
        contactInfo: thirdPartyInfo.contactInfo || '',
        caseNumber: thirdPartyInfo.caseNumber || ''
      },
      evidence: {
        documents: [],
        photos: [],
        officialDecision: '',
        uploadedBy: null,
        uploadedAt: null
      }
    };

    dispute.timeline.push({
      action: 'ESCALATED_TO_THIRD_PARTY',
      performedBy: adminId,
      details: `Chuyển sang bên thứ 3: ${thirdPartyInfo.name}`,
      timestamp: new Date()
    });

    await dispute.save();

    // Gửi notification cho cả 2 bên
    try {
      const admin = await User.findById(adminId);
      const notificationData = {
        type: 'DISPUTE',
        category: 'WARNING',
        title: 'Chuyển sang bên thứ 3',
        message: `Tranh chấp đã được chuyển sang bên thứ 3: ${thirdPartyInfo.name}. Vui lòng liên hệ và upload kết quả trước ${evidenceDeadline.toLocaleDateString('vi-VN')}.`,
        relatedDispute: dispute._id,
        actions: [{
          label: 'Xem chi tiết',
          url: `/disputes/${dispute._id}`,
          action: 'VIEW_DISPUTE'
        }],
        data: {
          disputeId: dispute.disputeId,
          thirdPartyName: thirdPartyInfo.name,
          thirdPartyContact: thirdPartyInfo.contactInfo,
          evidenceDeadline: evidenceDeadline.toISOString()
        },
        status: 'SENT'
      };

      await Promise.all([
        notificationService.createNotification({
          ...notificationData,
          recipient: dispute.complainant
        }),
        notificationService.createNotification({
          ...notificationData,
          recipient: dispute.respondent
        })
      ]);
    } catch (error) {
      console.error('Failed to create third party escalation notification:', error);
    }

    return dispute.populate(['complainant', 'respondent', 'assignedAdmin']);
  }

  /**
   * Admin chia sẻ thông tin shipper và thông tin cá nhân 2 bên
   * @param {String} disputeId - ID của dispute
   * @param {String} adminId - ID của admin
   * @returns {Promise<Dispute>}
   */
  async shareShipperInfo(disputeId, adminId) {
    const dispute = await Dispute.findOne(this._buildDisputeQuery(disputeId))
      .populate('complainant respondent assignedAdmin subOrder');

    if (!dispute) {
      throw new Error('Dispute không tồn tại');
    }

    if (dispute.status !== 'THIRD_PARTY_ESCALATED') {
      throw new Error('Dispute không ở trạng thái chuyển bên thứ 3');
    }

    // Kiểm tra admin role
    const admin = await User.findById(adminId);
    if (!admin || admin.role !== 'ADMIN') {
      throw new Error('Chỉ admin mới có quyền chia sẻ thông tin');
    }

    // Lấy thông tin cá nhân 2 bên
    const complainantInfo = {
      name: dispute.complainant.profile?.fullName || 'N/A',
      phone: dispute.complainant.phone || 'N/A',
      email: dispute.complainant.email || 'N/A',
      address: dispute.complainant.profile?.address || 'N/A'
    };

    const respondentInfo = {
      name: dispute.respondent.profile?.fullName || 'N/A',
      phone: dispute.respondent.phone || 'N/A',
      email: dispute.respondent.email || 'N/A',
      address: dispute.respondent.profile?.address || 'N/A'
    };

    // Cập nhật thông tin chia sẻ (bỏ shipperEvidence vì chưa có phần shipper)
    dispute.thirdPartyResolution.sharedData = {
      sharedAt: new Date(),
      sharedBy: adminId,
      partyInfo: {
        complainant: complainantInfo,
        respondent: respondentInfo
      }
    };

    dispute.timeline.push({
      action: 'ADMIN_SHARED_PARTY_INFO',
      performedBy: adminId,
      details: 'Admin đã chia sẻ thông tin cá nhân 2 bên để chuẩn bị cho bên thứ 3',
      timestamp: new Date()
    });

    await dispute.save();
    return dispute;
  }

  /**
   * Upload kết quả từ bên thứ 3
   * @param {String} disputeId - ID của dispute
   * @param {String} userId - ID của user upload (owner hoặc renter)
   * @param {Object} evidence - Bằng chứng kết quả
   * @returns {Promise<Dispute>}
   */
  async uploadThirdPartyEvidence(disputeId, userId, evidence) {
    const { documents, photos, officialDecision } = evidence;

    const dispute = await Dispute.findOne(this._buildDisputeQuery(disputeId));
    if (!dispute) {
      throw new Error('Dispute không tồn tại');
    }

    if (dispute.status !== 'THIRD_PARTY_ESCALATED') {
      throw new Error('Dispute chưa được chuyển sang bên thứ 3');
    }

    // Kiểm tra quyền upload (chỉ complainant hoặc respondent)
    const isComplainant = dispute.complainant.toString() === userId.toString();
    const isRespondent = dispute.respondent.toString() === userId.toString();

    if (!isComplainant && !isRespondent) {
      throw new Error('Chỉ complainant hoặc respondent mới có quyền upload bằng chứng');
    }

    // Cập nhật evidence
    dispute.thirdPartyResolution.evidence = {
      documents: documents || [],
      photos: photos || [],
      officialDecision,
      uploadedBy: userId,
      uploadedAt: new Date()
    };
    dispute.status = 'THIRD_PARTY_EVIDENCE_UPLOADED';

    dispute.timeline.push({
      action: 'THIRD_PARTY_EVIDENCE_UPLOADED',
      performedBy: userId,
      details: 'Upload kết quả từ bên thứ 3',
      timestamp: new Date()
    });

    await dispute.save();
    await dispute.populate([
      { path: 'complainant', select: 'profile email' },
      { path: 'respondent', select: 'profile email' },
      { path: 'thirdPartyResolution.evidence.uploadedBy', select: 'profile email' }
    ]);

    // Gửi notification cho bên kia và admin
    try {
      const uploader = await User.findById(userId);
      const otherParty = isComplainant ? dispute.respondent : dispute.complainant;
      const roleText = isComplainant ? 'Người khiếu nại' : 'Bên bị khiếu nại';
      
      // Thông báo cho bên kia
      await notificationService.createNotification({
        recipient: otherParty,
        type: 'DISPUTE',
        category: 'INFO',
        title: 'Bằng chứng bên thứ 3 đã upload',
        message: `${roleText} ${uploader.profile?.fullName || ''} đã upload kết quả từ bên thứ 3. Chờ admin đưa ra quyết định cuối cùng.`,
        relatedDispute: dispute._id,
        actions: [{
          label: 'Xem bằng chứng',
          url: `/disputes/${dispute._id}`,
          action: 'VIEW_EVIDENCE'
        }],
        data: {
          disputeId: dispute.disputeId,
          uploadedBy: userId.toString()
        },
        status: 'SENT'
      });

      // Thông báo cho admin
      if (dispute.assignedAdmin) {
        await notificationService.createNotification({
          recipient: dispute.assignedAdmin,
          type: 'DISPUTE',
          category: 'INFO',
          title: 'Bằng chứng bên thứ 3 đã sẵn sàng',
          message: `Tranh chấp ${dispute.disputeId} đã có kết quả từ bên thứ 3. Vui lòng xem xét và đưa ra quyết định cuối cùng.`,
          relatedDispute: dispute._id,
          actions: [{
            label: 'Xem và quyết định',
            url: `/admin/disputes/${dispute._id}`,
            action: 'ADMIN_FINAL_DECISION'
          }],
          data: {
            disputeId: dispute.disputeId,
            uploadedBy: userId.toString()
          },
          status: 'SENT'
        });
      }
    } catch (error) {
      console.error('Failed to create evidence upload notification:', error);
    }

    return dispute;
  }

  /**
   * Admin từ chối bằng chứng bên thứ 3 (fake hoặc không hợp lệ)
   * @param {String} disputeId - ID của dispute
   * @param {String} adminId - ID của admin
   * @param {String} reason - Lý do từ chối
   * @returns {Promise<Dispute>}
   */
  async rejectThirdPartyEvidence(disputeId, adminId, reason) {
    const dispute = await Dispute.findOne(this._buildDisputeQuery(disputeId))
      .populate('complainant')
      .populate('respondent');
      
    if (!dispute) {
      throw new Error('Dispute không tồn tại');
    }

    if (dispute.status !== 'THIRD_PARTY_EVIDENCE_UPLOADED') {
      throw new Error('Chỉ có thể từ chối khi đã có bằng chứng được upload');
    }

    // Kiểm tra admin role
    const admin = await User.findById(adminId);
    if (!admin || admin.role !== 'ADMIN') {
      throw new Error('Chỉ admin mới có quyền từ chối bằng chứng');
    }

    // Quay lại trạng thái THIRD_PARTY_ESCALATED
    dispute.status = 'THIRD_PARTY_ESCALATED';
    
    // Xóa bằng chứng đã upload (reset)
    dispute.thirdPartyResolution.evidence = {
      documents: [],
      photos: [],
      videos: [],
      officialDecision: '',
      uploadedBy: null,
      uploadedAt: null
    };

    // Cập nhật deadline mới (thêm 7 ngày nữa)
    const newDeadline = new Date();
    newDeadline.setDate(newDeadline.getDate() + 7);
    dispute.thirdPartyResolution.evidenceDeadline = newDeadline;

    // Thêm timeline
    dispute.timeline.push({
      action: 'THIRD_PARTY_EVIDENCE_REJECTED',
      performedBy: adminId,
      details: `Admin từ chối bằng chứng: ${reason}. Yêu cầu upload lại.`,
      timestamp: new Date()
    });

    await dispute.save();

    // Gửi notification cho cả 2 bên
    try {
      const notificationData = {
        type: 'DISPUTE',
        category: 'WARNING',
        title: 'Bằng chứng bên thứ 3 bị từ chối',
        message: `Admin đã từ chối bằng chứng vì: ${reason}. Vui lòng upload lại bằng chứng hợp lệ trước ${newDeadline.toLocaleDateString('vi-VN')}.`,
        relatedDispute: dispute._id,
        actions: [{
          label: 'Upload lại bằng chứng',
          url: `/disputes/${dispute._id}`,
          action: 'UPLOAD_EVIDENCE'
        }],
        data: {
          disputeId: dispute.disputeId,
          rejectionReason: reason,
          newDeadline: newDeadline.toISOString()
        },
        status: 'SENT'
      };

      // Gửi cho complainant
      await notificationService.createNotification({
        ...notificationData,
        recipient: dispute.complainant
      });

      // Gửi cho respondent
      await notificationService.createNotification({
        ...notificationData,
        recipient: dispute.respondent
      });

    } catch (error) {
      console.error('Failed to create rejection notification:', error);
    }

    return dispute;
  }

  /**
   * Admin đưa ra quyết định cuối cùng dựa trên kết quả bên thứ 3
   * @param {String} disputeId - ID của dispute
   * @param {String} adminId - ID của admin
   * @param {Object} finalDecision - Quyết định cuối cùng
   * @returns {Promise<Dispute>}
   */
  async adminFinalDecision(disputeId, adminId, finalDecision) {
    const { resolutionText, whoIsRight } = finalDecision;

    console.log('🚀 adminFinalDecision called');
    console.log('   disputeId:', disputeId);
    console.log('   resolutionText:', resolutionText);
    console.log('   whoIsRight:', whoIsRight);

    const dispute = await Dispute.findOne(this._buildDisputeQuery(disputeId))
      .populate('complainant')
      .populate('respondent');
    if (!dispute) {
      throw new Error('Dispute không tồn tại');
    }

    console.log('✅ Dispute found:', dispute.disputeId);
    console.log('   Status:', dispute.status);
    console.log('   Type:', dispute.type);

    if (dispute.status !== 'THIRD_PARTY_EVIDENCE_UPLOADED') {
      throw new Error('Chưa có bằng chứng từ bên thứ 3');
    }

    // Kiểm tra admin role
    const admin = await User.findById(adminId);
    if (!admin || admin.role !== 'ADMIN') {
      throw new Error('Chỉ admin mới có quyền đưa ra quyết định cuối');
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Cập nhật resolution
      dispute.status = 'RESOLVED';
      dispute.resolution = {
        resolvedBy: adminId,
        resolvedAt: new Date(),
        resolutionText,
        resolutionSource: 'THIRD_PARTY'
      };

      // Xử lý tiền cho dispute PRODUCT_NOT_AS_DESCRIBED và MISSING_ITEMS
      const isProductDispute = ['PRODUCT_NOT_AS_DESCRIBED', 'MISSING_ITEMS'].includes(dispute.type);
      
      console.log('🔍 Processing financials - whoIsRight:', whoIsRight);
      console.log('🔍 Dispute type:', dispute.type);
      console.log('🔍 Is product dispute:', isProductDispute);
      
      if (isProductDispute && whoIsRight) {
        console.log('✅ Starting financial processing for third party resolution');
        // Sử dụng logic tương tự _processDisputeFinancials
        const subOrder = await SubOrder.findById(dispute.subOrder).session(session);
        if (!subOrder) {
          throw new Error('SubOrder không tồn tại');
        }

        const product = subOrder.products[dispute.productIndex];
        const depositAmount = product.totalDeposit || 0;
        const rentalAmount = product.totalRental || 0;
        const totalAmount = depositAmount + rentalAmount;

        const renter = await User.findById(dispute.complainant).populate('wallet').session(session);
        const owner = await User.findById(dispute.respondent).populate('wallet').session(session);

        let renterWallet = await Wallet.findById(renter.wallet?._id).session(session);
        let ownerWallet = await Wallet.findById(owner.wallet?._id).session(session);
        const systemWallet = await SystemWallet.findOne({}).session(session);

        if (!systemWallet) {
          throw new Error('Không tìm thấy system wallet');
        }

        if (!renterWallet) {
          renterWallet = new Wallet({
            user: renter._id,
            balance: { available: 0, frozen: 0, pending: 0, display: 0 },
            currency: 'VND',
            status: 'ACTIVE'
          });
          await renterWallet.save({ session });
        }

        if (!ownerWallet) {
          ownerWallet = new Wallet({
            user: owner._id,
            balance: { available: 0, frozen: 0, pending: 0, display: 0 },
            currency: 'VND',
            status: 'ACTIVE'
          });
          await ownerWallet.save({ session });
        }

        if (whoIsRight === 'COMPLAINANT_RIGHT') {
          // Renter đúng -> Hoàn 100%
          console.log('💰 COMPLAINANT_RIGHT - Hoàn 100%');
          console.log('   Deposit:', depositAmount, '| Rental:', rentalAmount);
          
          if (depositAmount > 0) {
            systemWallet.balance.available -= depositAmount;
            await systemWallet.save({ session });
            renterWallet.balance.available += depositAmount;
          }

          if (rentalAmount > 0) {
            ownerWallet.balance.available -= rentalAmount;
            renterWallet.balance.available += rentalAmount;
          }

          renterWallet.balance.display = renterWallet.balance.available + renterWallet.balance.frozen + renterWallet.balance.pending;
          ownerWallet.balance.display = ownerWallet.balance.available + ownerWallet.balance.frozen + ownerWallet.balance.pending;
          
          await renterWallet.save({ session });
          await ownerWallet.save({ session });

          const depositRefundTx = new Transaction({
            user: renter._id,
            wallet: renterWallet._id,
            type: 'refund',
            amount: depositAmount,
            status: 'success',
            description: `Hoàn tiền cọc từ third party ${dispute.disputeId} - Renter đúng`,
            reference: dispute._id.toString(),
            paymentMethod: 'system_wallet',
            fromSystemWallet: true,
            toWallet: renterWallet._id,
            metadata: { disputeId: dispute.disputeId, type: 'third_party_deposit_refund' }
          });
          await depositRefundTx.save({ session });

          const rentalRefundTx = new Transaction({
            user: renter._id,
            wallet: renterWallet._id,
            type: 'refund',
            amount: rentalAmount,
            status: 'success',
            description: `Hoàn phí thuê từ third party ${dispute.disputeId} - Renter đúng`,
            reference: dispute._id.toString(),
            paymentMethod: 'wallet',
            fromWallet: ownerWallet._id,
            toWallet: renterWallet._id,
            metadata: { disputeId: dispute.disputeId, type: 'third_party_rental_refund' }
          });
          await rentalRefundTx.save({ session });

          dispute.resolution.financialImpact = {
            refundAmount: totalAmount,
            status: 'COMPLETED',
            notes: `Hoàn 100% deposit + phí thuê. Tổng: ${totalAmount.toLocaleString('vi-VN')}đ`
          };

        } else if (whoIsRight === 'RESPONDENT_RIGHT') {
          // Renter sai -> Phạt 1 ngày
          const dailyRate = rentalAmount / (product.rentalDays || 1);
          const penaltyAmount = dailyRate;
          const refundRental = rentalAmount - penaltyAmount;
          const refundAmount = depositAmount + refundRental;

          console.log('⚠️ RESPONDENT_RIGHT - Phạt 1 ngày');
          console.log('   Deposit:', depositAmount);
          console.log('   Rental:', rentalAmount);
          console.log('   Penalty:', penaltyAmount);
          console.log('   Refund rental:', refundRental);
          console.log('   Total refund:', refundAmount);

          if (depositAmount > 0) {
            systemWallet.balance.available -= depositAmount;
            await systemWallet.save({ session });
            renterWallet.balance.available += depositAmount;
          }

          if (refundRental > 0) {
            ownerWallet.balance.available -= refundRental;
            renterWallet.balance.available += refundRental;
          }

          renterWallet.balance.display = renterWallet.balance.available + renterWallet.balance.frozen + renterWallet.balance.pending;
          ownerWallet.balance.display = ownerWallet.balance.available + ownerWallet.balance.frozen + ownerWallet.balance.pending;
          
          await renterWallet.save({ session });
          await ownerWallet.save({ session });

          const depositRefundTx = new Transaction({
            user: renter._id,
            wallet: renterWallet._id,
            type: 'refund',
            amount: depositAmount,
            status: 'success',
            description: `Hoàn tiền cọc từ third party ${dispute.disputeId} - Owner đúng`,
            reference: dispute._id.toString(),
            paymentMethod: 'system_wallet',
            fromSystemWallet: true,
            toWallet: renterWallet._id,
            metadata: { disputeId: dispute.disputeId, type: 'third_party_deposit_refund' }
          });
          await depositRefundTx.save({ session });

          const partialRefundTx = new Transaction({
            user: renter._id,
            wallet: renterWallet._id,
            type: 'refund',
            amount: refundRental,
            status: 'success',
            description: `Hoàn phí thuê từ third party ${dispute.disputeId} - Phạt 1 ngày`,
            reference: dispute._id.toString(),
            paymentMethod: 'wallet',
            fromWallet: ownerWallet._id,
            toWallet: renterWallet._id,
            metadata: { disputeId: dispute.disputeId, type: 'third_party_partial_refund' }
          });
          await partialRefundTx.save({ session });

          const penaltyTx = new Transaction({
            user: owner._id,
            wallet: ownerWallet._id,
            type: 'PROMOTION_REVENUE',
            amount: penaltyAmount,
            status: 'success',
            description: `Nhận phí phạt từ third party ${dispute.disputeId}`,
            reference: dispute._id.toString(),
            paymentMethod: 'wallet',
            metadata: { disputeId: dispute.disputeId, type: 'third_party_penalty' }
          });
          await penaltyTx.save({ session });

          dispute.resolution.financialImpact = {
            refundAmount: refundAmount,
            penaltyAmount: penaltyAmount,
            status: 'COMPLETED',
            notes: `Hoàn deposit + rental phạt 1 ngày. Tổng hoàn: ${refundAmount.toLocaleString('vi-VN')}đ`
          };
        }
      } else {
        // Dispute khác - giữ financial impact từ input
        dispute.resolution.financialImpact = {
          refundAmount: 0,
          penaltyAmount: 0,
          compensationAmount: 0,
          status: 'PENDING'
        };
      }

      dispute.timeline.push({
        action: 'FINAL_DECISION_MADE',
        performedBy: adminId,
        details: 'Admin đưa ra quyết định cuối cùng dựa trên bên thứ 3',
        timestamp: new Date()
      });

      await dispute.save({ session });
      await session.commitTransaction();
      session.endSession();

      console.log('✅ Third party financial processing completed successfully');

      // Gửi notification cho cả 2 bên
      try {
        const admin = await User.findById(adminId);
        const notificationData = {
          type: 'DISPUTE',
          category: 'SUCCESS',
          title: 'Quyết định cuối cùng',
          message: `Admin ${admin.profile?.fullName || 'hệ thống'} đã đưa ra quyết định cuối cùng dựa trên kết quả bên thứ 3. Tranh chấp đã kết thúc.`,
          relatedDispute: dispute._id,
          actions: [{
            label: 'Xem kết quả',
            url: `/disputes/${dispute._id}`,
            action: 'VIEW_RESOLUTION'
          }],
          data: {
            disputeId: dispute.disputeId,
            resolutionText
          },
          status: 'SENT'
        };

        await Promise.all([
          notificationService.createNotification({
            ...notificationData,
            recipient: dispute.complainant
          }),
          notificationService.createNotification({
            ...notificationData,
            recipient: dispute.respondent
          })
        ]);
      } catch (error) {
        console.error('Failed to create final decision notification:', error);
      }

      return dispute.populate(['complainant', 'respondent', 'assignedAdmin']);
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      throw error;
    }
  }

  /**
   * Lấy thông tin third party resolution
   * @param {String} disputeId - ID của dispute
   * @param {String} userId - ID của user (để check quyền)
   * @returns {Promise<Object>}
   */
  async getThirdPartyInfo(disputeId, userId) {
    const dispute = await Dispute.findOne(this._buildDisputeQuery(disputeId))
      .populate('complainant', 'profile email phone')
      .populate('respondent', 'profile email phone')
      .populate('assignedAdmin', 'profile email')
      .populate('thirdPartyResolution.escalatedBy', 'profile email')
      .populate('thirdPartyResolution.evidence.uploadedBy', 'profile email')
      .populate('thirdPartyResolution.sharedData.sharedBy', 'profile email')
      .populate({
        path: 'subOrder',
        populate: [
          { path: 'owner', select: 'profile email phone' },
          { path: 'masterOrder', populate: { path: 'renter', select: 'profile email phone' } },
          { path: 'products.product' }
        ]
      });

    if (!dispute) {
      throw new Error('Dispute không tồn tại');
    }

    if (!['THIRD_PARTY_ESCALATED', 'THIRD_PARTY_EVIDENCE_UPLOADED', 'RESOLVED'].includes(dispute.status)) {
      throw new Error('Dispute chưa được chuyển sang bên thứ 3');
    }

    // Kiểm tra quyền: chỉ complainant, respondent hoặc admin mới xem được
    const user = await User.findById(userId);
    const isComplainant = dispute.complainant._id.toString() === userId.toString();
    const isRespondent = dispute.respondent._id.toString() === userId.toString();
    const isAdmin = user && user.role === 'ADMIN';

    if (!isComplainant && !isRespondent && !isAdmin) {
      throw new Error('Không có quyền xem thông tin này');
    }

    return {
      dispute,
      thirdPartyInfo: dispute.thirdPartyResolution.thirdPartyInfo,
      evidence: dispute.thirdPartyResolution.evidence,
      escalatedAt: dispute.thirdPartyResolution.escalatedAt,
      evidenceDeadline: dispute.thirdPartyResolution.evidenceDeadline,
      // Thông tin đã chia sẻ (chỉ hiển thị khi admin đã share)
      sharedData: dispute.thirdPartyResolution.sharedData || null,
      // Thông tin cần thiết để bên thứ 3 xem xét
      caseInfo: {
        product: dispute.subOrder.products[dispute.productIndex],
        complainant: {
          name: dispute.complainant.profile?.fullName || 'N/A',
          phone: dispute.complainant.phone,
          email: dispute.complainant.email
        },
        respondent: {
          name: dispute.respondent.profile?.fullName || 'N/A',
          phone: dispute.respondent.phone,
          email: dispute.respondent.email
        },
        shipperEvidence: dispute.adminDecision?.shipperEvidence,
        negotiationHistory: dispute.negotiationRoom?.finalAgreement
      }
    };
  }
}

module.exports = new ThirdPartyService();
