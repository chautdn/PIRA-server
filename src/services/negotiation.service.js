const mongoose = require('mongoose');
const Dispute = require('../models/Dispute');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const SystemWallet = require('../models/SystemWallet');
const Transaction = require('../models/Transaction');
const SubOrder = require('../models/SubOrder');
const notificationService = require('./notification.service');

class NegotiationService {
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
      console.error('Error updating user scores in negotiation:', error);
      // Không throw error để không ảnh hưởng đến resolve dispute
    }
  }

  /**
   * Tạo negotiation room
   * @param {String} disputeId - ID của dispute
   * @param {String} adminId - ID của admin
   * @returns {Promise<Dispute>}
   */
  async createNegotiationRoom(disputeId, adminId) {
    const dispute = await Dispute.findOne(this._buildDisputeQuery(disputeId));
    if (!dispute) {
      throw new Error('Dispute không tồn tại');
    }

    if (dispute.status !== 'NEGOTIATION_NEEDED') {
      throw new Error('Dispute không ở trạng thái cần đàm phán');
    }

    // Tạo chat room cho 2 bên
    const Chat = require('../models/Chat');
    const chatRoom = new Chat({
      participants: [dispute.complainant, dispute.respondent]
    });
    await chatRoom.save();

    // Cập nhật dispute
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + 3); // 3 ngày

    dispute.negotiationRoom = {
      startedAt: new Date(),
      deadline,
      chatRoomId: chatRoom._id,
      finalAgreement: {
        complainantAccepted: false,
        respondentAccepted: false
      }
    };
    dispute.status = 'IN_NEGOTIATION';

    dispute.timeline.push({
      action: 'NEGOTIATION_STARTED',
      performedBy: adminId,
      details: `Mở phòng đàm phán, hạn chót: ${deadline.toISOString()}`,
      timestamp: new Date()
    });

    await dispute.save();
    return dispute.populate(['complainant', 'respondent', 'negotiationRoom.chatRoomId']);
  }

  /**
   * Đề xuất thỏa thuận cuối cùng
   * @param {String} disputeId - ID của dispute
   * @param {String} userId - ID của user đề xuất
   * @param {Object} proposal - Đề xuất
   * @returns {Promise<Dispute>}
   */
  async proposeAgreement(disputeId, userId, proposal) {
    const { proposalText, proposalAmount } = proposal;

    const dispute = await Dispute.findOne(this._buildDisputeQuery(disputeId));
    if (!dispute) {
      throw new Error('Dispute không tồn tại');
    }

    if (dispute.status !== 'IN_NEGOTIATION') {
      throw new Error('Dispute không ở trạng thái đàm phán');
    }

    // Kiểm tra deadline
    if (new Date() > dispute.negotiationRoom.deadline) {
      throw new Error('Đã quá hạn đàm phán');
    }

    const isComplainant = dispute.complainant.toString() === userId.toString();
    const isRespondent = dispute.respondent.toString() === userId.toString();

    if (!isComplainant && !isRespondent) {
      throw new Error('Không có quyền đề xuất thỏa thuận');
    }

    // Cập nhật proposal
    dispute.negotiationRoom.finalAgreement = {
      proposedBy: userId,
      proposalText,
      proposalAmount: proposalAmount || 0,
      complainantAccepted: isComplainant, // Người đề xuất tự động accept
      respondentAccepted: isRespondent,
      acceptedAt: null
    };

    dispute.timeline.push({
      action: 'AGREEMENT_PROPOSED',
      performedBy: userId,
      details: `Đề xuất thỏa thuận: ${proposalText}`,
      timestamp: new Date()
    });

    await dispute.save();

    // Gửi notification cho bên kia
    try {
      const user = await User.findById(userId);
      const otherParty = isComplainant ? dispute.respondent : dispute.complainant;
      const roleText = isComplainant ? 'Người khiếu nại' : 'Bên bị khiếu nại';
      
      await notificationService.createNotification({
        recipient: otherParty,
        type: 'DISPUTE',
        category: 'INFO',
        title: 'Đề xuất thỏa thuận mới',
        message: `${roleText} ${user.profile?.fullName || ''} đã đề xuất thỏa thuận. Vui lòng xem xét và phản hồi.`,
        relatedDispute: dispute._id,
        actions: [{
          label: 'Xem đề xuất',
          url: `/disputes/${dispute._id}/negotiation`,
          action: 'VIEW_PROPOSAL'
        }],
        data: {
          disputeId: dispute.disputeId,
          proposalText,
          proposalAmount
        },
        status: 'SENT'
      });
    } catch (error) {
      console.error('Failed to create proposal notification:', error);
    }

    return dispute.populate(['complainant', 'respondent']);
  }

  /**
   * Chấp nhận hoặc từ chối thỏa thuận
   * @param {String} disputeId - ID của dispute
   * @param {String} userId - ID của user
   * @param {Boolean} accepted - Chấp nhận hay không
   * @returns {Promise<Dispute>}
   */
  async respondToAgreement(disputeId, userId, accepted) {
    const dispute = await Dispute.findOne(this._buildDisputeQuery(disputeId));
    if (!dispute) {
      throw new Error('Dispute không tồn tại');
    }

    if (dispute.status !== 'IN_NEGOTIATION') {
      throw new Error('Dispute không ở trạng thái đàm phán');
    }

    if (!dispute.negotiationRoom.finalAgreement.proposedBy) {
      throw new Error('Chưa có thỏa thuận nào được đề xuất');
    }

    // Kiểm tra deadline
    if (new Date() > dispute.negotiationRoom.deadline) {
      throw new Error('Đã quá hạn đàm phán');
    }

    const isComplainant = dispute.complainant.toString() === userId.toString();
    const isRespondent = dispute.respondent.toString() === userId.toString();

    if (!isComplainant && !isRespondent) {
      throw new Error('Không có quyền phản hồi thỏa thuận');
    }

    // Không cho người đề xuất respond lại chính mình
    if (dispute.negotiationRoom.finalAgreement.proposedBy.toString() === userId.toString()) {
      throw new Error('Không thể phản hồi thỏa thuận của chính mình');
    }

    // Cập nhật acceptance
    if (isComplainant) {
      dispute.negotiationRoom.finalAgreement.complainantAccepted = accepted;
    } else {
      dispute.negotiationRoom.finalAgreement.respondentAccepted = accepted;
    }

    dispute.timeline.push({
      action: accepted ? 'AGREEMENT_ACCEPTED' : 'AGREEMENT_REJECTED',
      performedBy: userId,
      details: accepted ? 'Chấp nhận thỏa thuận' : 'Từ chối thỏa thuận',
      timestamp: new Date()
    });

    // Kiểm tra xem cả 2 bên đã accept chưa
    if (dispute.negotiationRoom.finalAgreement.complainantAccepted && 
        dispute.negotiationRoom.finalAgreement.respondentAccepted) {
      // Cả 2 bên đồng ý -> Chờ admin chốt
      dispute.status = 'NEGOTIATION_AGREED';
      dispute.negotiationRoom.finalAgreement.acceptedAt = new Date();
      
      dispute.timeline.push({
        action: 'NEGOTIATION_AGREED',
        performedBy: userId,
        details: 'Cả 2 bên đã đồng ý thỏa thuận, chờ admin chốt',
        timestamp: new Date()
      });
    } else if (!accepted) {
      // Reset proposal nếu bị từ chối
      dispute.negotiationRoom.finalAgreement = {
        complainantAccepted: false,
        respondentAccepted: false
      };
    }

    await dispute.save();

    // Gửi notification cho bên kia và admin nếu cần
    try {
      const user = await User.findById(userId);
      const otherParty = isComplainant ? dispute.respondent : dispute.complainant;
      const roleText = isComplainant ? 'Người khiếu nại' : 'Bên bị khiếu nại';
      const decisionText = accepted ? 'chấp nhận' : 'từ chối';
      
      if (accepted && dispute.negotiationRoom.finalAgreement.complainantAccepted && 
          dispute.negotiationRoom.finalAgreement.respondentAccepted) {
        // Cả 2 bên đồng ý -> Thông báo cho admin
        const notificationData = {
          type: 'DISPUTE',
          category: 'SUCCESS',
          title: '2 bên đã thống nhất',
          message: `Tranh chấp ${dispute.disputeId} đã có thỏa thuận từ cả 2 bên. Vui lòng xác nhận và chốt quyết định.`,
          relatedDispute: dispute._id,
          actions: [{
            label: 'Xem chi tiết',
            url: `/admin/disputes/${dispute._id}`,
            action: 'ADMIN_REVIEW'
          }],
          data: {
            disputeId: dispute.disputeId,
            proposal: dispute.negotiationRoom.finalAgreement.proposalText
          },
          status: 'SENT'
        };
        
        // Gửi cho admin và cả 2 bên
        await Promise.all([
          notificationService.createNotification({
            ...notificationData,
            recipient: dispute.assignedAdmin
          }),
          notificationService.createNotification({
            ...notificationData,
            title: 'Đã thống nhất thỏa thuận',
            message: 'Cả 2 bên đã chấp nhận thỏa thuận. Chờ admin xác nhận cuối cùng.',
            recipient: dispute.complainant
          }),
          notificationService.createNotification({
            ...notificationData,
            title: 'Đã thống nhất thỏa thuận',
            message: 'Cả 2 bên đã chấp nhận thỏa thuận. Chờ admin xác nhận cuối cùng.',
            recipient: dispute.respondent
          })
        ]);
      } else {
        // Thông báo cho bên kia về phản hồi
        await notificationService.createNotification({
          recipient: otherParty,
          type: 'DISPUTE',
          category: accepted ? 'SUCCESS' : 'WARNING',
          title: `Phản hồi thỏa thuận`,
          message: `${roleText} ${user.profile?.fullName || ''} đã ${decisionText} thỏa thuận.${!accepted ? ' Hãy đề xuất lại hoặc chờ hết hạn đàm phán.' : ''}`,
          relatedDispute: dispute._id,
          actions: [{
            label: 'Xem chi tiết',
            url: `/disputes/${dispute._id}/negotiation`,
            action: 'VIEW_NEGOTIATION'
          }],
          data: {
            disputeId: dispute.disputeId,
            accepted
          },
          status: 'SENT'
        });
      }
    } catch (error) {
      console.error('Failed to create agreement response notification:', error);
    }

    return dispute.populate(['complainant', 'respondent']);
  }

  /**
   * Owner đưa ra quyết định cuối cùng
   * @param {String} disputeId - ID của dispute
   * @param {String} ownerId - ID của owner (respondent)
   * @param {String} decision - Quyết định cuối cùng
   * @returns {Promise<Dispute>}
   */
  async submitOwnerFinalDecision(disputeId, ownerId, decision) {
    const dispute = await Dispute.findOne(this._buildDisputeQuery(disputeId));
    if (!dispute) {
      throw new Error('Dispute không tồn tại');
    }

    if (dispute.status !== 'IN_NEGOTIATION' && dispute.status !== 'NEGOTIATION_NEEDED') {
      throw new Error('Dispute không ở trạng thái đàm phán');
    }

    // Kiểm tra quyền - chỉ owner (respondent) mới được đưa ra quyết định cuối
    if (dispute.respondent.toString() !== ownerId.toString()) {
      throw new Error('Chỉ owner mới có quyền đưa ra quyết định cuối cùng');
    }

    // Nếu chưa có negotiation room, tạo mới
    if (!dispute.negotiationRoom || !dispute.negotiationRoom.chatRoomId) {
      const Chat = require('../models/Chat');
      
      // Tạo chat room cho 2 bên
      const chatRoom = new Chat({
        participants: [dispute.complainant, dispute.respondent]
      });
      await chatRoom.save();

      // Tạo negotiation room
      const deadline = new Date();
      deadline.setDate(deadline.getDate() + 3); // 3 ngày

      dispute.negotiationRoom = {
        startedAt: new Date(),
        deadline,
        chatRoomId: chatRoom._id,
        finalAgreement: {
          complainantAccepted: false,
          respondentAccepted: false
        }
      };
    }

    // Kiểm tra deadline
    if (new Date() > dispute.negotiationRoom.deadline) {
      throw new Error('Đã quá hạn đàm phán');
    }

    // Cập nhật owner decision - chờ renter đồng ý
    dispute.negotiationRoom.finalAgreement = {
      ownerDecision: decision,
      decidedAt: new Date(),
      complainantAccepted: null, // Chờ renter phản hồi
      respondentAccepted: true   // Owner tự động đồng ý với quyết định của mình
    };
    
    console.log('🔍 Backend - Before save, finalAgreement:', JSON.stringify(dispute.negotiationRoom.finalAgreement, null, 2));

    // Vẫn ở trạng thái IN_NEGOTIATION, chờ renter đồng ý
    dispute.status = 'IN_NEGOTIATION';

    dispute.timeline.push({
      action: 'OWNER_DECISION_SUBMITTED',
      performedBy: ownerId,
      details: `Owner đã đưa ra quyết định cuối cùng, chờ renter phản hồi`,
      timestamp: new Date()
    });

    await dispute.save();
    console.log('🔍 Backend - After save, finalAgreement:', JSON.stringify(dispute.negotiationRoom.finalAgreement, null, 2));
    return dispute.populate(['complainant', 'respondent', 'negotiationRoom.chatRoomId']);
  }

  /**
   * Owner đưa ra quyết định cuối cùng (Owner tạo dispute RETURN)
   * @param {String} disputeId - ID của dispute
   * @param {String} ownerId - ID của owner (complainant trong RETURN)
   * @param {String} decision - Quyết định cuối cùng
   * @returns {Promise<Dispute>}
   */
  async submitOwnerDisputeFinalDecision(disputeId, ownerId, decision) {
    const dispute = await Dispute.findOne(this._buildDisputeQuery(disputeId));
    if (!dispute) {
      throw new Error('Dispute không tồn tại');
    }

    if (dispute.status !== 'IN_NEGOTIATION' && dispute.status !== 'NEGOTIATION_NEEDED') {
      throw new Error('Dispute không ở trạng thái đàm phán');
    }

    // Kiểm tra quyền - Owner tạo dispute RETURN nên owner là complainant
    if (dispute.complainant.toString() !== ownerId.toString()) {
      throw new Error('Chỉ owner mới có quyền đưa ra quyết định cuối cùng');
    }

    // Kiểm tra shipmentType
    if (dispute.shipmentType !== 'RETURN') {
      throw new Error('API này chỉ dành cho dispute RETURN');
    }

    // Kiểm tra deadline
    if (dispute.negotiationRoom && new Date() > dispute.negotiationRoom.deadline) {
      throw new Error('Đã quá hạn đàm phán');
    }

    // Cập nhật owner decision - chờ renter đồng ý
    dispute.negotiationRoom.finalAgreement = {
      ownerDecision: decision,
      decidedAt: new Date(),
      complainantAccepted: true, // Owner (complainant) tự động đồng ý
      respondentAccepted: null   // Chờ renter (respondent) phản hồi
    };

    // Vẫn ở trạng thái IN_NEGOTIATION, chờ renter đồng ý
    dispute.status = 'IN_NEGOTIATION';

    dispute.timeline.push({
      action: 'OWNER_DECISION_SUBMITTED',
      performedBy: ownerId,
      details: `Owner đã đưa ra quyết định cuối cùng, chờ renter phản hồi`,
      timestamp: new Date()
    });

    await dispute.save();
    return dispute.populate(['complainant', 'respondent', 'negotiationRoom.chatRoomId']);
  }

  /**
   * Renter phản hồi quyết định cuối của owner
   * @param {String} disputeId - ID của dispute
   * @param {String} renterId - ID của renter
   * @param {Boolean} accepted - Có đồng ý không
   * @returns {Promise<Dispute>}
   */
  async respondToOwnerDecision(disputeId, renterId, accepted) {
    const dispute = await Dispute.findOne(this._buildDisputeQuery(disputeId));
    if (!dispute) {
      throw new Error('Dispute không tồn tại');
    }

    if (dispute.status !== 'IN_NEGOTIATION') {
      throw new Error('Dispute không ở trạng thái đàm phán');
    }

    // Xác định renter dựa trên shipmentType
    // DELIVERY: renter = complainant
    // RETURN: renter = respondent
    const isRenter = dispute.shipmentType === 'DELIVERY'
      ? dispute.complainant.toString() === renterId.toString()
      : dispute.respondent.toString() === renterId.toString();

    if (!isRenter) {
      throw new Error('Chỉ renter mới có quyền phản hồi quyết định này');
    }

    // Kiểm tra có quyết định của owner chưa
    if (!dispute.negotiationRoom.finalAgreement?.ownerDecision) {
      throw new Error('Owner chưa đưa ra quyết định cuối cùng');
    }

    // Cập nhật phản hồi của renter - dựa trên shipmentType
    if (dispute.shipmentType === 'DELIVERY') {
      dispute.negotiationRoom.finalAgreement.complainantAccepted = accepted;
    } else {
      dispute.negotiationRoom.finalAgreement.respondentAccepted = accepted;
    }

    if (accepted) {
      // Renter đồng ý -> gửi cho admin để xử lý cuối cùng
      dispute.status = 'NEGOTIATION_AGREED';
      
      dispute.timeline.push({
        action: 'RENTER_AGREED_OWNER_DECISION',
        performedBy: renterId,
        details: 'Renter đã đồng ý với quyết định của owner, gửi cho admin xử lý',
        timestamp: new Date()
      });
    } else {
      // Renter không đồng ý -> chuyển cho bên thứ 3
      dispute.status = 'THIRD_PARTY_ESCALATED';
      
      // Thiết lập deadline 7 ngày để upload evidence
      const evidenceDeadline = new Date();
      evidenceDeadline.setDate(evidenceDeadline.getDate() + 7);
      
      dispute.thirdPartyResolution = {
        escalatedAt: new Date(),
        escalatedBy: renterId,
        evidenceDeadline: evidenceDeadline
      };
      
      dispute.timeline.push({
        action: 'RENTER_REJECTED_OWNER_DECISION',
        performedBy: renterId,
        details: 'Renter từ chối quyết định của owner, chuyển cho bên thứ 3',
        timestamp: new Date()
      });
    }

    await dispute.save();
    return dispute.populate(['complainant', 'respondent', 'negotiationRoom.chatRoomId']);
  }

  /**
   * Admin chốt thỏa thuận từ negotiation
   * @param {String} disputeId - ID của dispute
   * @param {String} adminId - ID của admin
   * @param {Object} finalDecision - Quyết định cuối cùng từ admin
   * @returns {Promise<Dispute>}
   */
  async adminFinalizeNegotiation(disputeId, adminId, finalDecision = {}) {
    const { decision, reasoning } = finalDecision;

    console.log('🚀 adminFinalizeNegotiation called');
    console.log('   decision from admin:', decision);
    console.log('   reasoning:', reasoning);

    const dispute = await Dispute.findOne(this._buildDisputeQuery(disputeId))
      .populate('complainant')
      .populate('respondent');
    if (!dispute) {
      throw new Error('Dispute không tồn tại');
    }

    if (dispute.status !== 'NEGOTIATION_AGREED') {
      throw new Error('Chưa có thỏa thuận được cả 2 bên đồng ý');
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Chốt resolution
      dispute.status = 'RESOLVED';
      dispute.resolution = {
        resolvedBy: adminId,
        resolvedAt: new Date(),
        resolutionText: reasoning || dispute.negotiationRoom.finalAgreement.proposalText || dispute.negotiationRoom.finalAgreement.ownerDecision,
        resolutionSource: 'NEGOTIATION'
      };

      // Xử lý tiền dựa trên decision từ admin
      const isProductDispute = ['PRODUCT_NOT_AS_DESCRIBED', 'MISSING_ITEMS'].includes(dispute.type);
      const whoIsRight = decision; // Admin chọn rõ ràng

      console.log('🔍 Processing financials for negotiation');
      console.log('   Dispute type:', dispute.type);
      console.log('   whoIsRight:', whoIsRight);
      
      if (isProductDispute && whoIsRight) {
        console.log('✅ Starting financial processing for negotiation resolution');
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
              description: `Hoàn 100% (cọc + phí thuê) từ negotiation ${dispute.disputeId} - Renter đúng`,
              reference: dispute._id.toString(),
              paymentMethod: 'system_wallet',
              fromSystemWallet: true,
              toWallet: renterWallet._id,
              metadata: { 
                disputeId: dispute.disputeId, 
                type: 'negotiation_full_refund',
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
              description: `Hoàn deposit + rental (trừ phạt 1 ngày ${penaltyAmount.toLocaleString('vi-VN')}đ) từ negotiation ${dispute.disputeId} - Owner đúng`,
              reference: dispute._id.toString(),
              paymentMethod: 'system_wallet',
              fromSystemWallet: true,
              toWallet: renterWallet._id,
              metadata: { 
                disputeId: dispute.disputeId, 
                type: 'negotiation_refund',
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
              description: `Nhận phí phạt 1 ngày từ negotiation ${dispute.disputeId} - Renter sai`,
              reference: dispute._id.toString(),
              paymentMethod: 'system_wallet',
              fromSystemWallet: true,
              toWallet: ownerWallet._id,
              metadata: { disputeId: dispute.disputeId, type: 'negotiation_penalty' }
            });
            await penaltyTx.save({ session });

            dispute.resolution.financialImpact = {
              refundAmount: totalRefund,
              penaltyAmount: penaltyAmount,
              status: 'COMPLETED',
              notes: `Hoàn deposit + rental phạt 1 ngày. Tổng hoàn: ${totalRefund.toLocaleString('vi-VN')}đ`
            };
          }
      } // end if (isProductDispute && whoIsRight)
      
      // ========== XỬ LÝ RETURN DISPUTES (DAMAGED_ON_RETURN) ==========
      // Với RETURN dispute: Owner là complainant, Renter là respondent
      // Deposit đang ở FROZEN wallet của renter
      const isReturnDispute = dispute.shipmentType === 'RETURN' && dispute.type === 'DAMAGED_ON_RETURN';
      
      if (isReturnDispute && whoIsRight) {
        console.log('✅ Processing RETURN dispute (DAMAGED_ON_RETURN) financials');
        
        const subOrder = await SubOrder.findById(dispute.subOrder).session(session);
        if (!subOrder) {
          throw new Error('SubOrder không tồn tại');
        }
        
        const product = subOrder.products[dispute.productIndex];
        const orderDepositAmount = product.totalDeposit || 0;
        
        // Owner là complainant, Renter là respondent
        const owner = await User.findById(dispute.complainant).populate('wallet').session(session);
        const renter = await User.findById(dispute.respondent).populate('wallet').session(session);
        
        let ownerWallet = await Wallet.findById(owner.wallet?._id).session(session);
        let renterWallet = await Wallet.findById(renter.wallet?._id).session(session);
        
        if (!renterWallet) {
          throw new Error('Không tìm thấy ví của renter');
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
          // Owner đúng -> Renter bồi thường
          // Lấy compensationAmount từ finalAgreement hoặc dùng deposit
          const compensationAmount = dispute.negotiationRoom?.finalAgreement?.compensationAmount 
            || dispute.repairCost 
            || orderDepositAmount;
          
          console.log(`   Compensation amount: ${compensationAmount.toLocaleString('vi-VN')}đ`);
          console.log(`   Order deposit: ${orderDepositAmount.toLocaleString('vi-VN')}đ`);
          
          const renterFrozenBalance = renterWallet.balance?.frozen || 0;
          const renterAvailableBalance = renterWallet.balance?.available || 0;
          
          // Chỉ trừ TỐI ĐA = deposit của đơn này từ frozen
          const maxFromFrozen = Math.min(orderDepositAmount, renterFrozenBalance);
          
          let frozenUsed = 0;
          let availableUsed = 0;
          
          if (compensationAmount <= maxFromFrozen) {
            frozenUsed = compensationAmount;
          } else {
            frozenUsed = maxFromFrozen;
            availableUsed = compensationAmount - frozenUsed;
            
            if (renterAvailableBalance < availableUsed) {
              throw new Error(`Renter không đủ số dư. Cần thêm ${(availableUsed - renterAvailableBalance).toLocaleString('vi-VN')}đ từ ví available`);
            }
          }
          
          console.log(`   💰 Trừ từ frozen: ${frozenUsed.toLocaleString('vi-VN')}đ`);
          console.log(`   💰 Trừ từ available: ${availableUsed.toLocaleString('vi-VN')}đ`);
          
          // Tính phần dư cọc cần hoàn lại (nếu bồi thường < deposit)
          const remainingDeposit = orderDepositAmount - frozenUsed;
          console.log(`   💰 Phần dư cọc cần hoàn: ${remainingDeposit.toLocaleString('vi-VN')}đ`);
          
          // Trừ tiền bồi thường từ renter
          if (frozenUsed > 0) renterWallet.balance.frozen -= frozenUsed;
          if (availableUsed > 0) renterWallet.balance.available -= availableUsed;
          
          // Hoàn phần dư cọc về available cho renter (nếu có)
          if (remainingDeposit > 0) {
            renterWallet.balance.frozen -= remainingDeposit;
            renterWallet.balance.available += remainingDeposit;
            console.log(`   💰 Hoàn ${remainingDeposit.toLocaleString('vi-VN')}đ từ frozen về available cho renter`);
          }
          
          renterWallet.balance.display = (renterWallet.balance.available || 0) + (renterWallet.balance.frozen || 0) + (renterWallet.balance.pending || 0);
          await renterWallet.save({ session });
          
          // Chuyển tiền cho owner
          ownerWallet.balance.available += compensationAmount;
          ownerWallet.balance.display = (ownerWallet.balance.available || 0) + (ownerWallet.balance.frozen || 0) + (ownerWallet.balance.pending || 0);
          await ownerWallet.save({ session });
          
          // Tạo transaction records
          const renterTx = new Transaction({
            user: renter._id,
            wallet: renterWallet._id,
            type: 'penalty',
            amount: compensationAmount,
            status: 'success',
            description: `Bồi thường từ đàm phán - Dispute ${dispute.disputeId}`,
            reference: dispute._id.toString(),
            paymentMethod: 'wallet',
            metadata: { 
              disputeId: dispute.disputeId, 
              type: 'negotiation_compensation',
              frozenUsed,
              availableUsed,
              isDebit: true
            }
          });
          await renterTx.save({ session });
          
          // Transaction hoàn phần dư cọc cho renter (nếu có)
          if (remainingDeposit > 0) {
            const refundTx = new Transaction({
              user: renter._id,
              wallet: renterWallet._id,
              type: 'refund',
              amount: remainingDeposit,
              status: 'success',
              description: `Hoàn phần dư cọc sau bồi thường - Dispute ${dispute.disputeId}`,
              reference: dispute._id.toString(),
              paymentMethod: 'wallet',
              metadata: { 
                disputeId: dispute.disputeId, 
                type: 'deposit_refund_after_compensation',
                originalDeposit: orderDepositAmount,
                compensationPaid: compensationAmount
              }
            });
            await refundTx.save({ session });
          }
          
          const ownerTx = new Transaction({
            user: owner._id,
            wallet: ownerWallet._id,
            type: 'TRANSFER_IN',
            amount: compensationAmount,
            status: 'success',
            description: `Nhận bồi thường từ đàm phán - Dispute ${dispute.disputeId}`,
            reference: dispute._id.toString(),
            paymentMethod: 'wallet',
            metadata: { 
              disputeId: dispute.disputeId, 
              type: 'negotiation_compensation_received'
            }
          });
          await ownerTx.save({ session });
          
          dispute.resolution.financialImpact = {
            compensationAmount,
            frozenUsed,
            availableUsed,
            remainingDepositRefunded: remainingDeposit,
            paidBy: renter._id,
            paidTo: owner._id,
            status: 'COMPLETED',
            notes: `Owner đúng. Renter bồi thường ${compensationAmount.toLocaleString('vi-VN')}đ (Frozen: ${frozenUsed.toLocaleString('vi-VN')}đ + Available: ${availableUsed.toLocaleString('vi-VN')}đ)${remainingDeposit > 0 ? `. Hoàn dư cọc: ${remainingDeposit.toLocaleString('vi-VN')}đ` : ''}`
          };
          
        } else if (whoIsRight === 'RESPONDENT_RIGHT') {
          // Renter đúng -> Mở khóa deposit từ frozen sang available của renter
          const renterFrozenBalance = renterWallet.balance?.frozen || 0;
          const amountToUnfreeze = Math.min(orderDepositAmount, renterFrozenBalance);
          
          console.log(`   💰 Mở khóa deposit: ${amountToUnfreeze.toLocaleString('vi-VN')}đ`);
          
          if (amountToUnfreeze > 0) {
            renterWallet.balance.frozen -= amountToUnfreeze;
            renterWallet.balance.available += amountToUnfreeze;
            renterWallet.balance.display = (renterWallet.balance.available || 0) + (renterWallet.balance.frozen || 0) + (renterWallet.balance.pending || 0);
            await renterWallet.save({ session });
          }
          
          // Tạo transaction record
          const renterTx = new Transaction({
            user: renter._id,
            wallet: renterWallet._id,
            type: 'TRANSFER_IN',
            amount: amountToUnfreeze,
            status: 'success',
            description: `Mở khóa tiền cọc từ đàm phán - Dispute ${dispute.disputeId}`,
            reference: dispute._id.toString(),
            paymentMethod: 'wallet',
            metadata: { 
              disputeId: dispute.disputeId, 
              type: 'negotiation_deposit_unfreeze',
              isUnfreeze: true
            }
          });
          await renterTx.save({ session });
          
          dispute.resolution.financialImpact = {
            refundAmount: amountToUnfreeze,
            paidTo: renter._id,
            status: 'COMPLETED',
            notes: `Renter đúng. Mở khóa ${amountToUnfreeze.toLocaleString('vi-VN')}đ tiền cọc`
          };
        }
      } // end if (isReturnDispute && whoIsRight)

      dispute.timeline.push({
        action: 'NEGOTIATION_FINALIZED',
        performedBy: adminId,
        details: 'Admin đã chốt thỏa thuận từ đàm phán',
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

      console.log('✅ Negotiation financial processing completed successfully');
      
      return dispute.populate(['complainant', 'respondent', 'assignedAdmin']);
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      throw error;
    }
  }

  /**
   * Kiểm tra và xử lý negotiation timeout
   * @param {String} disputeId - ID của dispute
   * @returns {Promise<Dispute>}
   */
  async checkNegotiationTimeout(disputeId) {
    const dispute = await Dispute.findOne(this._buildDisputeQuery(disputeId));
    if (!dispute) {
      throw new Error('Dispute không tồn tại');
    }

    if (dispute.status !== 'IN_NEGOTIATION') {
      throw new Error('Dispute không ở trạng thái đàm phán');
    }

    const now = new Date();
    if (now > dispute.negotiationRoom.deadline) {
      // Quá hạn đàm phán -> Chuyển sang third party
      dispute.status = 'NEGOTIATION_FAILED';
      
      dispute.timeline.push({
        action: 'NEGOTIATION_TIMEOUT',
        performedBy: null,
        details: 'Đàm phán thất bại do quá hạn 3 ngày',
        timestamp: now
      });

      await dispute.save();
    }

    return dispute;
  }

  /**
   * Lấy thông tin negotiation room
   * @param {String} disputeId - ID của dispute
   * @param {String} userId - ID của user
   * @returns {Promise<Object>}
   */
  async getNegotiationRoom(disputeId, userId) {
    const dispute = await Dispute.findOne(this._buildDisputeQuery(disputeId))
      .populate('complainant', 'profile email')
      .populate('respondent', 'profile email')
      .populate('negotiationRoom.chatRoomId');

    if (!dispute) {
      throw new Error('Dispute không tồn tại');
    }

    // Kiểm tra quyền truy cập
    const isComplainant = dispute.complainant._id.toString() === userId.toString();
    const isRespondent = dispute.respondent._id.toString() === userId.toString();
    const isAdmin = await User.findById(userId).then(u => u && u.role === 'ADMIN');

    if (!isComplainant && !isRespondent && !isAdmin) {
      throw new Error('Không có quyền xem phòng đàm phán');
    }

    return {
      dispute,
      chatRoom: dispute.negotiationRoom.chatRoomId,
      deadline: dispute.negotiationRoom.deadline,
      timeRemaining: dispute.negotiationRoom.deadline - new Date(),
      finalAgreement: dispute.negotiationRoom.finalAgreement
    };
  }

  /**
   * User chuyển tranh chấp cho bên thứ 3
   * @param {String} disputeId - ID của dispute
   * @param {String} userId - ID của user
   * @param {String} reason - Lý do escalate
   * @returns {Promise<Dispute>}
   */
  async userEscalateToThirdParty(disputeId, userId, reason) {
    const dispute = await Dispute.findOne(this._buildDisputeQuery(disputeId));

    if (!dispute) {
      throw new Error('Dispute không tồn tại');
    }

    if (dispute.status !== 'IN_NEGOTIATION') {
      throw new Error('Dispute không ở trạng thái đàm phán');
    }

    // Kiểm tra user có quyền escalate không
    const isComplainant = dispute.complainant.toString() === userId.toString();
    const isRespondent = dispute.respondent.toString() === userId.toString();

    if (!isComplainant && !isRespondent) {
      throw new Error('Không có quyền chuyển tranh chấp cho bên thứ 3');
    }

    // Thiết lập deadline 7 ngày để upload evidence
    const evidenceDeadline = new Date();
    evidenceDeadline.setDate(evidenceDeadline.getDate() + 7);

    dispute.thirdPartyResolution = {
      escalatedAt: new Date(),
      escalatedBy: userId,
      evidenceDeadline: evidenceDeadline
    };

    dispute.status = 'THIRD_PARTY_ESCALATED';

    dispute.timeline.push({
      action: 'USER_ESCALATED_TO_THIRD_PARTY',
      performedBy: userId,
      details: `User đã chuyển tranh chấp cho bên thứ 3. Lý do: ${reason || 'Không thể thỏa thuận'}`,
      timestamp: new Date()
    });

    await dispute.save();
    return dispute;
  }

  /**
   * Upload bằng chứng từ bên thứ 3
   * @param {String} disputeId - ID của dispute
   * @param {String} userId - ID của user upload
   * @param {Object} evidenceData - {documents, photos, officialDecision}
   * @returns {Promise<Dispute>}
   */
  async uploadThirdPartyEvidence(disputeId, userId, evidenceData) {
    const { documents, photos, officialDecision } = evidenceData;

    const dispute = await Dispute.findOne(this._buildDisputeQuery(disputeId));

    if (!dispute) {
      throw new Error('Dispute không tồn tại');
    }

    if (dispute.status !== 'THIRD_PARTY_ESCALATED') {
      throw new Error('Dispute không ở trạng thái chuyển bên thứ 3');
    }

    // Kiểm tra user có quyền upload không (phải là complainant hoặc respondent)
    const isComplainant = dispute.complainant.toString() === userId.toString();
    const isRespondent = dispute.respondent.toString() === userId.toString();

    if (!isComplainant && !isRespondent) {
      throw new Error('Không có quyền upload bằng chứng');
    }

    // Kiểm tra deadline
    if (new Date() > dispute.thirdPartyResolution.evidenceDeadline) {
      throw new Error('Đã hết hạn upload bằng chứng');
    }

    // Cập nhật evidence
    dispute.thirdPartyResolution.evidence = {
      documents: documents || [],
      photos: photos || [],
      officialDecision: officialDecision || '',
      uploadedBy: userId,
      uploadedAt: new Date()
    };

    dispute.status = 'THIRD_PARTY_EVIDENCE_UPLOADED';

    dispute.timeline.push({
      action: 'THIRD_PARTY_EVIDENCE_UPLOADED',
      performedBy: userId,
      details: 'Đã upload bằng chứng kết quả từ bên thứ 3',
      timestamp: new Date()
    });

    await dispute.save();
    await dispute.populate([
      { path: 'complainant', select: 'profile email' },
      { path: 'respondent', select: 'profile email' },
      { path: 'thirdPartyResolution.evidence.uploadedBy', select: 'profile email' }
    ]);
    return dispute;
  }

  /**
   * Admin xử lý kết quả đàm phán cuối cùng
   * @param {String} disputeId - ID của dispute
   * @param {String} adminId - ID của admin
   * @param {Object} data - {decision, reasoning, compensationAmount}
   * @returns {Promise<Dispute>}
   */
  async processFinalAgreement(disputeId, adminId, data) {
    const { decision, reasoning, compensationAmount } = data;

    const dispute = await Dispute.findOne(this._buildDisputeQuery(disputeId))
      .populate('complainant')
      .populate('respondent')
      .populate('subOrder')
      .populate('negotiationRoom.chatRoomId');

    if (!dispute) {
      throw new Error('Dispute không tồn tại');
    }

    if (dispute.status !== 'NEGOTIATION_AGREED') {
      throw new Error('Dispute không ở trạng thái đã thỏa thuận');
    }

    if (!dispute.negotiationRoom || !dispute.negotiationRoom.finalAgreement) {
      throw new Error('Không có thông tin đàm phán');
    }

    // Cập nhật kết quả xử lý admin
    dispute.negotiationRoom.finalAgreement.adminProcessed = {
      decision,
      reasoning,
      processedBy: adminId,
      processedAt: new Date()
    };

    if (decision === 'APPROVE_AGREEMENT') {
      const session = await mongoose.startSession();
      session.startTransaction();
      
      try {
        // Xử lý tiền cho RETURN disputes (DAMAGED_ON_RETURN)
        const isReturnDispute = dispute.shipmentType === 'RETURN' && dispute.type === 'DAMAGED_ON_RETURN';
        
        if (isReturnDispute) {
          console.log('[processFinalAgreement] Processing RETURN dispute financials');
          
          const product = dispute.subOrder.products[dispute.productIndex];
          const orderDepositAmount = product.totalDeposit || 0;
          
          // Lấy số tiền bồi thường từ data hoặc từ finalAgreement hoặc dùng deposit
          const amount = compensationAmount 
            || dispute.negotiationRoom?.finalAgreement?.compensationAmount 
            || dispute.repairCost 
            || orderDepositAmount;
          
          console.log(`   Compensation: ${amount.toLocaleString('vi-VN')}đ`);
          console.log(`   Order deposit: ${orderDepositAmount.toLocaleString('vi-VN')}đ`);
          
          // Owner là complainant, Renter là respondent
          const owner = await User.findById(dispute.complainant._id).populate('wallet').session(session);
          const renter = await User.findById(dispute.respondent._id).populate('wallet').session(session);
          
          let ownerWallet = await Wallet.findById(owner.wallet?._id).session(session);
          let renterWallet = await Wallet.findById(renter.wallet?._id).session(session);
          
          if (!renterWallet) {
            throw new Error('Không tìm thấy ví của renter');
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
          
          const renterFrozenBalance = renterWallet.balance?.frozen || 0;
          const renterAvailableBalance = renterWallet.balance?.available || 0;
          
          // Chỉ trừ TỐI ĐA = deposit của đơn này từ frozen
          const maxFromFrozen = Math.min(orderDepositAmount, renterFrozenBalance);
          
          let frozenUsed = 0;
          let availableUsed = 0;
          
          if (amount <= maxFromFrozen) {
            frozenUsed = amount;
          } else {
            frozenUsed = maxFromFrozen;
            availableUsed = amount - frozenUsed;
            
            if (renterAvailableBalance < availableUsed) {
              throw new Error(`Renter không đủ số dư. Cần thêm ${(availableUsed - renterAvailableBalance).toLocaleString('vi-VN')}đ từ ví available`);
            }
          }
          
          console.log(`   💰 Trừ từ frozen: ${frozenUsed.toLocaleString('vi-VN')}đ`);
          console.log(`   💰 Trừ từ available: ${availableUsed.toLocaleString('vi-VN')}đ`);
          
          // Trừ tiền từ renter
          if (frozenUsed > 0) renterWallet.balance.frozen -= frozenUsed;
          if (availableUsed > 0) renterWallet.balance.available -= availableUsed;
          renterWallet.balance.display = (renterWallet.balance.available || 0) + (renterWallet.balance.frozen || 0) + (renterWallet.balance.pending || 0);
          await renterWallet.save({ session });
          
          // Chuyển tiền cho owner
          ownerWallet.balance.available += amount;
          ownerWallet.balance.display = (ownerWallet.balance.available || 0) + (ownerWallet.balance.frozen || 0) + (ownerWallet.balance.pending || 0);
          await ownerWallet.save({ session });
          
          // Tạo transaction records
          const renterTx = new Transaction({
            user: renter._id,
            wallet: renterWallet._id,
            type: 'penalty',
            amount: amount,
            status: 'success',
            description: `Bồi thường từ đàm phán - Dispute ${dispute.disputeId}`,
            reference: dispute._id.toString(),
            paymentMethod: 'wallet',
            metadata: { 
              disputeId: dispute.disputeId, 
              type: 'agreement_compensation',
              frozenUsed,
              availableUsed,
              isDebit: true
            }
          });
          await renterTx.save({ session });
          
          const ownerTx = new Transaction({
            user: owner._id,
            wallet: ownerWallet._id,
            type: 'TRANSFER_IN',
            amount: amount,
            status: 'success',
            description: `Nhận bồi thường từ đàm phán - Dispute ${dispute.disputeId}`,
            reference: dispute._id.toString(),
            paymentMethod: 'wallet',
            metadata: { 
              disputeId: dispute.disputeId, 
              type: 'agreement_compensation_received'
            }
          });
          await ownerTx.save({ session });
          
          dispute.resolution = {
            resolvedBy: adminId,
            resolvedAt: new Date(),
            resolutionText: reasoning || 'Admin phê duyệt thỏa thuận đàm phán',
            resolutionSource: 'NEGOTIATION',
            financialImpact: {
              compensationAmount: amount,
              frozenUsed,
              availableUsed,
              paidBy: renter._id,
              paidTo: owner._id,
              status: 'COMPLETED'
            }
          };
        }
        
        dispute.status = 'RESOLVED';
        dispute.resolvedAt = new Date();
        
        dispute.timeline.push({
          action: 'AGREEMENT_APPROVED',
          performedBy: adminId,
          details: `Admin phê duyệt thỏa thuận đàm phán. ${reasoning || ''}`,
          timestamp: new Date()
        });
        
        await dispute.save({ session });
        await session.commitTransaction();
        session.endSession();
        
      } catch (error) {
        await session.abortTransaction();
        session.endSession();
        throw error;
      }
    } else {
      // Từ chối thỏa thuận - Reset để đàm phán lại
      dispute.status = 'IN_NEGOTIATION';
      dispute.negotiationRoom.finalAgreement.ownerDecision = null;
      dispute.negotiationRoom.finalAgreement.decidedAt = null;
      dispute.negotiationRoom.finalAgreement.complainantAccepted = null;
      dispute.negotiationRoom.finalAgreement.respondentAccepted = null;
      
      // Extend deadline thêm 3 ngày
      const newDeadline = new Date();
      newDeadline.setDate(newDeadline.getDate() + 3);
      dispute.negotiationRoom.deadline = newDeadline;
      
      dispute.timeline.push({
        action: 'AGREEMENT_REJECTED',
        performedBy: adminId,
        details: `Admin từ chối thỏa thuận. ${reasoning || ''}`,
        timestamp: new Date()
      });
      
      await dispute.save();
    }

    return dispute;
  }
}

module.exports = new NegotiationService();
