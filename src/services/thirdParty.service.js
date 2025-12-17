const mongoose = require('mongoose');
const Dispute = require('../models/Dispute');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const SystemWallet = require('../models/SystemWallet');
const Transaction = require('../models/Transaction');
const SubOrder = require('../models/SubOrder');
const Shipment = require('../models/Shipment');
const ShipmentProof = require('../models/Shipment_Proof');
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
   * Helper: Cập nhật credit score và loyalty points sau khi resolve dispute
   * @param {ObjectId} winnerId - ID người thắng (đúng)
   * @param {ObjectId} loserId - ID người thua (sai)
   * @param {Session} session - MongoDB session
   */
  async _updateUserScoresAfterResolve(winnerId, loserId, session) {
    try {
      // Cập nhật người thua: -30 credit, +5 loyalty
      await User.findByIdAndUpdate(
        loserId,
        { 
          $inc: { 
            creditScore: -30,
            loyaltyPoints: 5
          } 
        },
        { session }
      );

      // Cập nhật người thắng: +5 credit (nếu <100), +5 loyalty
      const winner = await User.findById(winnerId).session(session);
      if (winner) {
        const creditIncrease = winner.creditScore < 100 ? 5 : 0;
        await User.findByIdAndUpdate(
          winnerId,
          { 
            $inc: { 
              creditScore: creditIncrease,
              loyaltyPoints: 5
            } 
          },
          { session }
        );
      }
    } catch (error) {
      console.error('Error updating user scores in third party:', error);
      // Không throw error để không ảnh hưởng đến resolve dispute
    }
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

    // ========== LẤY ẢNH BẰNG CHỨNG TỪ SHIPPER ==========
    let shipperEvidence = {
      deliveryPhase: null,  // Giai đoạn giao hàng (DELIVERY)
      returnPhase: null     // Giai đoạn trả hàng (RETURN)
    };

    try {
      const subOrderId = dispute.subOrder._id || dispute.subOrder;
      const productIndex = dispute.productIndex || 0;

      // Tìm DELIVERY shipment cho product này
      const deliveryShipment = await Shipment.findOne({ 
        subOrder: subOrderId, 
        productIndex: productIndex,
        type: 'DELIVERY'
      });

      if (deliveryShipment) {
        const deliveryProof = await ShipmentProof.findOne({ shipment: deliveryShipment._id });
        
        shipperEvidence.deliveryPhase = {
          shipmentId: deliveryShipment._id,
          type: 'DELIVERY',
          shipper: deliveryShipment.shipper || null,
          // Giai đoạn 1: Shipper nhận hàng từ Owner
          pickupFromOwner: {
            images: deliveryProof?.imagesBeforeDelivery || 
                    (deliveryProof?.imageBeforeDelivery ? [deliveryProof.imageBeforeDelivery] : []),
            description: 'Ảnh khi shipper nhận hàng từ chủ hàng (Owner)',
            timestamp: deliveryShipment.tracking?.pickedUpAt || null
          },
          // Giai đoạn 2: Shipper giao hàng cho Renter
          deliveryToRenter: {
            images: deliveryProof?.imagesAfterDelivery || 
                    (deliveryProof?.imageAfterDelivery ? [deliveryProof.imageAfterDelivery] : []),
            description: 'Ảnh khi shipper giao hàng cho người thuê (Renter)',
            timestamp: deliveryShipment.tracking?.deliveredAt || null
          },
          notes: deliveryProof?.notes || deliveryShipment.tracking?.notes || ''
        };
      }

      // Tìm RETURN shipment cho product này
      const returnShipment = await Shipment.findOne({ 
        subOrder: subOrderId, 
        productIndex: productIndex,
        type: 'RETURN'
      });

      if (returnShipment) {
        const returnProof = await ShipmentProof.findOne({ shipment: returnShipment._id });
        
        shipperEvidence.returnPhase = {
          shipmentId: returnShipment._id,
          type: 'RETURN',
          shipper: returnShipment.shipper || null,
          // Giai đoạn 3: Shipper nhận hàng từ Renter
          pickupFromRenter: {
            images: returnProof?.imagesBeforeDelivery || 
                    (returnProof?.imageBeforeDelivery ? [returnProof.imageBeforeDelivery] : []),
            description: 'Ảnh khi shipper nhận hàng trả từ người thuê (Renter)',
            timestamp: returnShipment.tracking?.pickedUpAt || null
          },
          // Giai đoạn 4: Shipper giao hàng về cho Owner
          deliveryToOwner: {
            images: returnProof?.imagesAfterDelivery || 
                    (returnProof?.imageAfterDelivery ? [returnProof.imageAfterDelivery] : []),
            description: 'Ảnh khi shipper giao hàng về cho chủ hàng (Owner)',
            timestamp: returnShipment.tracking?.deliveredAt || null
          },
          notes: returnProof?.notes || returnShipment.tracking?.notes || ''
        };
      }
    } catch (error) {
      console.error('Error fetching shipper evidence:', error);
      // Không throw error, tiếp tục với data có được
    }

    // Cập nhật thông tin chia sẻ
    dispute.thirdPartyResolution.sharedData = {
      sharedAt: new Date(),
      sharedBy: adminId,
      partyInfo: {
        complainant: complainantInfo,
        respondent: respondentInfo
      },
      shipperEvidence: shipperEvidence
    };

    dispute.timeline.push({
      action: 'ADMIN_SHARED_PARTY_INFO',
      performedBy: adminId,
      details: 'Admin đã chia sẻ thông tin cá nhân 2 bên và ảnh bằng chứng shipper để chuẩn bị cho bên thứ 3',
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

    const dispute = await Dispute.findOne(this._buildDisputeQuery(disputeId))
      .populate('complainant')
      .populate('respondent');
    if (!dispute) {
      throw new Error('Dispute không tồn tại');
    }

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
      
      if (isProductDispute && whoIsRight) {
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
          // Renter đúng -> Hoàn 100% từ system wallet
          // Cả deposit và rental đều nằm trong system wallet vì renter chưa nhận hàng (DELIVERY dispute)
          
          if (systemWallet.balance.available < totalAmount) {
            throw new Error(`System wallet không đủ tiền để hoàn. Available: ${systemWallet.balance.available.toLocaleString('vi-VN')}đ, Cần: ${totalAmount.toLocaleString('vi-VN')}đ`);
          }

          systemWallet.balance.available -= totalAmount;
          await systemWallet.save({ session });
          
          renterWallet.balance.available += totalAmount;
          renterWallet.balance.display = renterWallet.balance.available + renterWallet.balance.frozen + renterWallet.balance.pending;
          await renterWallet.save({ session });

          const fullRefundTx = new Transaction({
            user: renter._id,
            wallet: renterWallet._id,
            type: 'refund',
            amount: totalAmount,
            status: 'success',
            description: `Hoàn 100% (cọc + phí thuê) từ third party ${dispute.disputeId} - Renter đúng`,
            reference: dispute._id.toString(),
            paymentMethod: 'system_wallet',
            fromSystemWallet: true,
            toWallet: renterWallet._id,
            metadata: { 
              disputeId: dispute.disputeId, 
              type: 'third_party_full_refund',
              depositAmount,
              rentalAmount
            }
          });
          await fullRefundTx.save({ session });

          dispute.resolution.financialImpact = {
            refundAmount: totalAmount,
            status: 'COMPLETED',
            notes: `Hoàn 100% deposit + phí thuê. Tổng: ${totalAmount.toLocaleString('vi-VN')}đ`
          };

        } else if (whoIsRight === 'RESPONDENT_RIGHT') {
          // Renter sai -> Hoàn deposit + rental (trừ 1 ngày phạt), chuyển 1 ngày cho owner
          const dailyRate = rentalAmount / (product.rentalDays || 1);
          const penaltyAmount = dailyRate;
          const refundRental = rentalAmount - penaltyAmount;
          const totalRefund = depositAmount + refundRental;
          const totalSystemAmount = depositAmount + rentalAmount;

          // Kiểm tra system wallet có đủ tiền không
          if (systemWallet.balance.available < totalSystemAmount) {
            throw new Error(`System wallet không đủ tiền. Available: ${systemWallet.balance.available.toLocaleString('vi-VN')}đ, Cần: ${totalSystemAmount.toLocaleString('vi-VN')}đ`);
          }

          // 1. Hoàn deposit + rental (trừ phạt) từ system wallet cho renter
          systemWallet.balance.available -= totalRefund;
          renterWallet.balance.available += totalRefund;

          // 2. Chuyển phạt 1 ngày từ system wallet cho owner
          systemWallet.balance.available -= penaltyAmount;
          ownerWallet.balance.available += penaltyAmount;

          await systemWallet.save({ session });

          renterWallet.balance.display = renterWallet.balance.available + renterWallet.balance.frozen + renterWallet.balance.pending;
          ownerWallet.balance.display = ownerWallet.balance.available + ownerWallet.balance.frozen + ownerWallet.balance.pending;
          
          await renterWallet.save({ session });
          await ownerWallet.save({ session });

          const refundTx = new Transaction({
            user: renter._id,
            wallet: renterWallet._id,
            type: 'refund',
            amount: totalRefund,
            status: 'success',
            description: `Hoàn deposit + rental (trừ phạt 1 ngày ${penaltyAmount.toLocaleString('vi-VN')}đ) từ third party ${dispute.disputeId} - Owner đúng`,
            reference: dispute._id.toString(),
            paymentMethod: 'system_wallet',
            fromSystemWallet: true,
            toWallet: renterWallet._id,
            metadata: { 
              disputeId: dispute.disputeId, 
              type: 'third_party_refund',
              depositRefund: depositAmount,
              rentalRefund: refundRental
            }
          });
          await refundTx.save({ session });

          const penaltyTx = new Transaction({
            user: owner._id,
            wallet: ownerWallet._id,
            type: 'PROMOTION_REVENUE',
            amount: penaltyAmount,
            status: 'success',
            description: `Nhận phí phạt 1 ngày từ third party ${dispute.disputeId} - Renter sai`,
            reference: dispute._id.toString(),
            paymentMethod: 'system_wallet',
            fromSystemWallet: true,
            toWallet: ownerWallet._id,
            metadata: { disputeId: dispute.disputeId, type: 'third_party_penalty' }
          });
          await penaltyTx.save({ session });

          dispute.resolution.financialImpact = {
            refundAmount: totalRefund,
            penaltyAmount: penaltyAmount,
            status: 'COMPLETED',
            notes: `Hoàn deposit + rental phạt 1 ngày. Tổng hoàn: ${totalRefund.toLocaleString('vi-VN')}đ, Phạt: ${penaltyAmount.toLocaleString('vi-VN')}đ`
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

      // Cập nhật credit/loyalty points dựa trên whoIsRight
      if (whoIsRight === 'COMPLAINANT_RIGHT') {
        // Renter (complainant) đúng, Owner (respondent) sai
        await this._updateUserScoresAfterResolve(dispute.complainant, dispute.respondent, session);
      } else if (whoIsRight === 'RESPONDENT_RIGHT') {
        // Owner (respondent) đúng, Renter (complainant) sai
        await this._updateUserScoresAfterResolve(dispute.respondent, dispute.complainant, session);
      }

      await dispute.save({ session });
      await session.commitTransaction();
      session.endSession();

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
