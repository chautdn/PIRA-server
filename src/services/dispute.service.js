const mongoose = require('mongoose');
const Dispute = require('../models/Dispute');
const SubOrder = require('../models/SubOrder');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const SystemWallet = require('../models/SystemWallet');
const Transaction = require('../models/Transaction');
const { generateDisputeId, generateShipmentId } = require('../utils/idGenerator');
const notificationService = require('./notification.service');
const ChatGateway = require('../socket/chat.gateway');

class DisputeService {
  /**
   * Helper: Tạo query tìm dispute theo _id hoặc disputeId
   */
  _buildDisputeQuery(disputeId) {
    return mongoose.Types.ObjectId.isValid(disputeId) && disputeId.length === 24
      ? { _id: disputeId }
      : { disputeId };
  }

  /**
   * Helper: Lấy label của dispute type
   */
  _getDisputeTypeLabel(type) {
    const labels = {
      'PRODUCT_NOT_AS_DESCRIBED': 'Sản phẩm không đúng mô tả',
      'MISSING_ITEMS': 'Thiếu vật phẩm',
      'DAMAGED_BY_SHIPPER': 'Hư hại do shipper',
      'DELIVERY_FAILED_RENTER': 'Giao hàng thất bại',
      'PRODUCT_DEFECT': 'Sản phẩm lỗi khi sử dụng',
      'DAMAGED_ON_RETURN': 'Hư hại khi trả hàng',
      'LATE_RETURN': 'Trả muộn',
      'RETURN_FAILED_OWNER': 'Trả hàng thất bại',
      'RENTER_NO_RETURN': 'Renter không trả hàng'
    };
    return labels[type] || type;
  }

  /**
   * Helper: Tạo và emit notification
   */
  async _createAndEmitNotification(notificationData) {
    try {
      const notification = await notificationService.createNotification(notificationData);
      
      // Emit notification qua socket (global.chatGateway được set trong app.js)
      if (global.chatGateway) {
        global.chatGateway.emitNotification(notificationData.recipient.toString(), notification);
      }
      
      return notification;
    } catch (error) {
      console.error('Error creating/emitting notification:', error);
      throw error;
    }
  }

  /**
   * Helper: Cập nhật credit score và loyalty points sau khi resolve dispute
   * @param {ObjectId} winnerId - ID người thắng (đúng)
   * @param {ObjectId} loserId - ID người thua (sai)
   * @param {Session} session - MongoDB session
   */
  async _updateUserScoresAfterResolve(winnerId, loserId, session) {
    try {
      // Cập nhật người thua: -30 credit
      await User.findByIdAndUpdate(
        loserId,
        { 
          $inc: { 
            creditScore: -30,
            loyaltyPoints: 5 // Cả 2 đều được +5 loyalty
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
      console.error('Error updating user scores:', error);
      // Không throw error để không ảnh hưởng đến resolve dispute
    }
  }

  /**
   * Helper: Xử lý giao dịch tiền cho dispute PRODUCT_NOT_AS_DESCRIBED và MISSING_ITEMS
   * @param {Dispute} dispute - Dispute object
   * @param {String} decision - 'COMPLAINANT_RIGHT' (renter đúng) hoặc 'RESPONDENT_RIGHT' (renter sai)
   * @param {Session} session - MongoDB session
   * @returns {Promise<Object>} - Thông tin giao dịch
   */
  async _processDisputeFinancials(dispute, decision, session) {
    const isProductDispute = ['PRODUCT_NOT_AS_DESCRIBED', 'MISSING_ITEMS'].includes(dispute.type);
    
    if (!isProductDispute) {
      return null; // Không xử lý tiền cho các type khác
    }

    const subOrder = await SubOrder.findById(dispute.subOrder).session(session);
    if (!subOrder) {
      throw new Error('SubOrder không tồn tại');
    }

    const product = subOrder.products[dispute.productIndex];
    const depositAmount = product.totalDeposit || 0;
    const rentalAmount = product.totalRental || 0;
    const totalAmount = depositAmount + rentalAmount;

    // Lấy ví của renter và owner
    const renter = await User.findById(dispute.complainant).populate('wallet').session(session);
    const owner = await User.findById(dispute.respondent).populate('wallet').session(session);

    if (!renter || !owner) {
      throw new Error('Không tìm thấy thông tin người dùng');
    }

    let renterWallet = await Wallet.findById(renter.wallet?._id).session(session);
    let ownerWallet = await Wallet.findById(owner.wallet?._id).session(session);
    const systemWallet = await SystemWallet.findOne({}).session(session);

    if (!systemWallet) {
      throw new Error('Không tìm thấy system wallet');
    }

    // Tạo ví nếu chưa có
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

    let financialDetails = {};

    if (decision === 'COMPLAINANT_RIGHT') {
      // Renter đúng -> Hoàn 100% deposit + rental fee
      // Cả deposit và rental đều nằm trong system wallet vì renter chưa nhận hàng (DELIVERY dispute)
      
      // Hoàn cả deposit + rental từ system wallet cho renter
      if (systemWallet.balance.available < totalAmount) {
        throw new Error(`System wallet không đủ tiền để hoàn. Available: ${systemWallet.balance.available.toLocaleString('vi-VN')}đ, Cần: ${totalAmount.toLocaleString('vi-VN')}đ`);
      }
      
      systemWallet.balance.available -= totalAmount;
      await systemWallet.save({ session });
      
      renterWallet.balance.available += totalAmount;

      renterWallet.balance.display = renterWallet.balance.available + renterWallet.balance.frozen + renterWallet.balance.pending;
      await renterWallet.save({ session });

      // Tạo transaction record - Hoàn toàn bộ từ system wallet
      const fullRefundTx = new Transaction({
        user: renter._id,
        wallet: renterWallet._id,
        type: 'refund',
        amount: totalAmount,
        status: 'success',
        description: `Hoàn 100% (cọc + phí thuê) từ dispute ${dispute.disputeId} - Renter đúng`,
        reference: dispute._id.toString(),
        paymentMethod: 'system_wallet',
        fromSystemWallet: true,
        toWallet: renterWallet._id,
        metadata: { 
          disputeId: dispute.disputeId, 
          type: 'full_refund',
          depositAmount,
          rentalAmount
        }
      });
      await fullRefundTx.save({ session });

      financialDetails = {
        refundAmount: totalAmount,
        depositRefund: depositAmount,
        rentalRefund: rentalAmount,
        penaltyAmount: 0,
        compensationAmount: 0,
        paidBy: owner._id,
        paidTo: renter._id,
        status: 'COMPLETED',
        notes: `Hoàn 100% deposit (${depositAmount.toLocaleString('vi-VN')}đ) + phí thuê (${rentalAmount.toLocaleString('vi-VN')}đ) cho renter. Tổng: ${totalAmount.toLocaleString('vi-VN')}đ`
      };

    } else if (decision === 'RESPONDENT_RIGHT') {
      // Renter sai -> Hoàn deposit + rental (trừ 1 ngày phạt), chuyển 1 ngày cho owner
      const dailyRate = rentalAmount / (product.rentalDays || 1);
      const penaltyAmount = dailyRate; // Phạt 1 ngày
      const refundRental = rentalAmount - penaltyAmount;
      const totalRefund = depositAmount + refundRental;
      const totalSystemAmount = depositAmount + rentalAmount; // System wallet giữ cả deposit + rental

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

      // Tạo transaction records
      const refundTx = new Transaction({
        user: renter._id,
        wallet: renterWallet._id,
        type: 'refund',
        amount: totalRefund,
        status: 'success',
        description: `Hoàn deposit + rental (trừ phạt 1 ngày ${penaltyAmount.toLocaleString('vi-VN')}đ) từ dispute ${dispute.disputeId} - Owner đúng`,
        reference: dispute._id.toString(),
        paymentMethod: 'system_wallet',
        fromSystemWallet: true,
        toWallet: renterWallet._id,
        metadata: { 
          disputeId: dispute.disputeId, 
          type: 'dispute_refund',
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
        description: `Nhận phí phạt 1 ngày từ dispute ${dispute.disputeId} - Renter sai`,
        reference: dispute._id.toString(),
        paymentMethod: 'system_wallet',
        fromSystemWallet: true,
        toWallet: ownerWallet._id,
        metadata: { disputeId: dispute.disputeId, type: 'penalty_revenue' }
      });
      await penaltyTx.save({ session });

      financialDetails = {
        refundAmount: totalRefund,
        depositRefund: depositAmount,
        rentalRefund: refundRental,
        penaltyAmount: penaltyAmount,
        compensationAmount: penaltyAmount,
        paidBy: renter._id,
        paidTo: owner._id,
        status: 'COMPLETED',
        notes: `Hoàn 100% deposit (${depositAmount.toLocaleString('vi-VN')}đ) + phí thuê trừ 1 ngày phạt (${refundRental.toLocaleString('vi-VN')}đ). ` +
               `Owner giữ phạt 1 ngày: ${penaltyAmount.toLocaleString('vi-VN')}đ. ` +
               `Tổng hoàn cho renter: ${totalRefund.toLocaleString('vi-VN')}đ`
      };
    }

    return financialDetails;
  }

  /**
   * Tạo dispute mới
   * @param {Object} data - Dữ liệu dispute
   * @returns {Promise<Dispute>}
   */
  async createDispute(data) {
    const {
      subOrderId,
      productId,
      productIndex,
      shipmentId,
      shipmentType,
      complainantId,
      type,
      title,
      description,
      evidence,
      repairCost
    } = data;

    // Lấy thông tin SubOrder
    const subOrder = await SubOrder.findById(subOrderId)
      .populate('owner')
      .populate({
        path: 'masterOrder',
        select: '_id renter' // Lấy _id và renter
      })
      .lean(); // Dùng lean() để không trigger Mongoose middleware khi save
    
    if (!subOrder) {
      throw new Error('SubOrder không tồn tại');
    }

    // Kiểm tra product tồn tại
    const product = subOrder.products[productIndex];
    if (!product || product.product.toString() !== productId.toString()) {
      throw new Error('Product không tồn tại trong SubOrder');
    }

    // Validation đặc biệt cho RENTER_NO_RETURN: chỉ cho phép khi SubOrder và Product đều có status RETURN_FAILED
    if (type === 'RENTER_NO_RETURN') {
      if (subOrder.status !== 'RETURN_FAILED') {
        throw new Error('Dispute RENTER_NO_RETURN chỉ có thể được tạo khi SubOrder có trạng thái RETURN_FAILED');
      }
      if (product.productStatus !== 'RETURN_FAILED') {
        throw new Error('Dispute RENTER_NO_RETURN chỉ có thể được tạo khi Product có trạng thái RETURN_FAILED');
      }
    }

    // Xác định respondent dựa trên shipmentType
    let respondentId;
    if (shipmentType === 'DELIVERY') {
      // Renter mở dispute -> Owner là respondent
      respondentId = subOrder.owner._id;
      
      // Kiểm tra complainant phải là renter
      const masterOrderRenterId = subOrder.masterOrder?.renter?._id || subOrder.masterOrder?.renter;
      if (complainantId.toString() !== masterOrderRenterId.toString()) {
        throw new Error('Chỉ renter mới có thể mở dispute trong giai đoạn giao hàng');
      }
    } else if (shipmentType === 'RETURN') {
      // Owner mở dispute -> Renter là respondent
      const masterOrderRenterId = subOrder.masterOrder?.renter?._id || subOrder.masterOrder?.renter;
      respondentId = masterOrderRenterId;
      
      // Kiểm tra complainant phải là owner
      if (complainantId.toString() !== subOrder.owner._id.toString()) {
        throw new Error('Chỉ owner mới có thể mở dispute trong giai đoạn trả hàng');
      }
    }

    // Kiểm tra xem có thể mở dispute không
    const canOpen = Dispute.schema.methods.canOpenDispute.call(
      {},
      product.productStatus,
      shipmentType,
      complainantId,
      subOrder.owner._id
    );

    if (!canOpen.allowed) {
      throw new Error(canOpen.reason);
    }

    // Tạo dispute
    const disputeId = generateDisputeId();
    
    // Kiểm tra nếu là lỗi của shipper → Auto-escalate lên Admin
    const isShipperFault = type === 'DAMAGED_BY_SHIPPER';
    
    const dispute = new Dispute({
      disputeId,
      subOrder: subOrderId,
      productId,
      productIndex,
      shipment: shipmentId,
      shipmentType,
      complainant: complainantId,
      respondent: respondentId,
      type,
      title,
      description,
      evidence: evidence || {},
      repairCost: repairCost || 0, // Chi phí sửa chữa cho DAMAGED_ON_RETURN
      status: isShipperFault ? 'ADMIN_REVIEW' : 'OPEN',
      timeline: [{
        action: 'DISPUTE_CREATED',
        performedBy: complainantId,
        details: `Dispute được tạo với lý do: ${type}`,
        timestamp: new Date()
      }]
    });

    // Nếu là lỗi shipper, thêm timeline auto-escalate
    if (isShipperFault) {
      dispute.timeline.push({
        action: 'AUTO_ESCALATED_TO_ADMIN',
        performedBy: complainantId,
        details: 'Tranh chấp về lỗi shipper được tự động chuyển lên Admin để xử lý với đơn vị vận chuyển',
        timestamp: new Date()
      });
      
      // Đặt response deadline cho Admin (7 ngày)
      dispute.responseDeadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    }

    await dispute.save();

    // Cập nhật product status sang DISPUTED (dùng findByIdAndUpdate để tránh validation conflict)
    await SubOrder.findOneAndUpdate(
      { 
        _id: subOrderId,
        'products.product': productId
      },
      {
        $set: {
          'products.$.productStatus': 'DISPUTED'
        },
        $push: {
          'products.$.disputes': dispute._id
        }
      },
      { new: true }
    );

    // Gửi notification
    try {
      const complainant = await User.findById(complainantId);
      const disputeTypeLabel = this._getDisputeTypeLabel(type);
      
      if (isShipperFault) {
        // Thông báo cho cả 2 bên: tranh chấp đã được gửi lên Admin
        const notificationData = {
          type: 'DISPUTE',
          category: 'INFO',
          title: 'Tranh chấp đã chuyển lên Admin',
          message: `Tranh chấp "${disputeTypeLabel}" đã được tự động chuyển lên Admin để xử lý với đơn vị vận chuyển. Cả 2 bên vui lòng chờ kết quả xử lý.`,
          relatedDispute: dispute._id,
          relatedOrder: subOrder.masterOrder,
          actions: [{
            label: 'Xem chi tiết',
            url: `/disputes/${dispute._id}`,
            action: 'VIEW_DISPUTE'
          }],
          data: {
            disputeId: dispute.disputeId,
            disputeType: type,
            shipmentType,
            autoEscalated: true
          },
          status: 'SENT'
        };
        
        // Gửi cho respondent (bên còn lại)
        await this._createAndEmitNotification({
          ...notificationData,
          recipient: respondentId
        });
        
        // Gửi lại cho complainant (người tạo)
        await this._createAndEmitNotification({
          ...notificationData,
          recipient: complainantId
        });
        
        // Gửi notification cho Admin team
        const admins = await User.find({ role: 'ADMIN' });
        for (const admin of admins) {
          await this._createAndEmitNotification({
            recipient: admin._id,
            type: 'DISPUTE',
            category: 'URGENT',
            title: 'Tranh chấp lỗi shipper cần xử lý',
            message: `${complainant.profile?.fullName || 'Người dùng'} báo cáo "${disputeTypeLabel}". Cần liên hệ đơn vị vận chuyển để xử lý.`,
            relatedDispute: dispute._id,
            relatedOrder: subOrder.masterOrder,
            actions: [{
              label: 'Xử lý ngay',
              url: `/admin/disputes/${dispute._id}`,
              action: 'REVIEW_DISPUTE'
            }],
            data: {
              disputeId: dispute.disputeId,
              disputeType: type,
              shipmentType,
              urgent: true
            },
            status: 'SENT'
          });
        }
      } else {
        // Flow thông thường: gửi notification cho respondent
        await this._createAndEmitNotification({
          recipient: respondentId,
          type: 'DISPUTE',
          category: 'WARNING',
          title: 'Tranh chấp mới',
          message: `${complainant.profile?.fullName || 'Người dùng'} đã tạo tranh chấp: ${disputeTypeLabel}. Vui lòng phản hồi trong 48h.`,
          relatedDispute: dispute._id,
          relatedOrder: subOrder.masterOrder,
          actions: [{
            label: 'Xem chi tiết',
            url: `/disputes/${dispute._id}`,
            action: 'VIEW_DISPUTE'
          }],
          data: {
            disputeId: dispute.disputeId,
            disputeType: type,
            shipmentType
          },
          status: 'SENT'
        });
      }
    } catch (error) {
      console.error('Failed to create dispute notification:', error);
    }

    return dispute.populate(['complainant', 'respondent', 'subOrder']);
  }

  /**
   * Respondent phản hồi dispute
   * @param {String} disputeId - ID của dispute
   * @param {String} respondentId - ID của respondent
   * @param {Object} response - Phản hồi
   * @returns {Promise<Dispute>}
   */
  async respondentResponse(disputeId, respondentId, response) {
    const { decision, reason, evidence } = response;

    const dispute = await Dispute.findOne(this._buildDisputeQuery(disputeId));
    if (!dispute) {
      throw new Error('Dispute không tồn tại');
    }

    // Kiểm tra quyền
    if (dispute.respondent.toString() !== respondentId.toString()) {
      throw new Error('Không có quyền phản hồi dispute này');
    }

    if (dispute.status !== 'OPEN') {
      throw new Error('Dispute không ở trạng thái chờ phản hồi');
    }

    // Cập nhật response
    dispute.respondentResponse = {
      decision,
      reason,
      respondedAt: new Date(),
      evidence: evidence || {}
    };

    if (decision === 'ACCEPTED') {
      // Respondent (owner) đồng ý -> Xử lý tự động
      const subOrder = await SubOrder.findById(dispute.subOrder);
      const product = subOrder.products[dispute.productIndex];
      const depositAmount = product.totalDeposit || 0;
      const repairCost = dispute.repairCost || 0;
      
      dispute.status = 'RESOLVED'; // Chuyển thẳng sang RESOLVED
      dispute.resolution = {
        resolvedBy: respondentId,
        resolvedAt: new Date(),
        resolutionText: reason || `Owner chấp nhận khiếu nại của renter.`,
        resolutionSource: 'RESPONDENT_ACCEPTED'
      };

      // Xử lý tiền cho dispute PRODUCT_NOT_AS_DESCRIBED và MISSING_ITEMS
      const session = await mongoose.startSession();
      session.startTransaction();

      try {
        const financialDetails = await this._processDisputeFinancials(dispute, 'COMPLAINANT_RIGHT', session);
        
        if (financialDetails) {
          dispute.resolution.financialImpact = financialDetails;
        } else if (repairCost > 0) {
          // Trường hợp khác (DAMAGED_ON_RETURN) - giữ logic cũ
          dispute.resolution.financialImpact = {
            compensationAmount: repairCost,
            status: 'PENDING'
          };
        }
        
        dispute.timeline.push({
          action: 'RESPONDENT_ACCEPTED',
          performedBy: respondentId,
          details: financialDetails 
            ? `Owner chấp nhận. ${financialDetails.notes}`
            : `Respondent đã chấp nhận. Chi phí sửa: ${repairCost.toLocaleString()}đ, Tiền cọc: ${depositAmount.toLocaleString()}đ.`,
          timestamp: new Date()
        });

        // Cập nhật credit/loyalty: complainant thắng, respondent thua
        await this._updateUserScoresAfterResolve(dispute.complainant, respondentId, session);

        await dispute.save({ session });
        await session.commitTransaction();
        session.endSession();
      } catch (error) {
        await session.abortTransaction();
        session.endSession();
        throw error;
      }
    } else {
      // Respondent từ chối
      // Nếu là RETURN (owner khiếu nại) -> Đàm phán
      // Nếu là DELIVERY (renter khiếu nại) -> Admin review
      if (dispute.shipmentType === 'RETURN') {
        // Owner khiếu nại, renter từ chối -> Đàm phán trực tiếp
        dispute.status = 'IN_NEGOTIATION';
        
        // Tạo chat room cho 2 bên
        const Chat = require('../models/Chat');
        const chatRoom = new Chat({
          participants: [dispute.complainant, dispute.respondent]
        });
        await chatRoom.save();
        
        // Khởi tạo phòng đàm phán với chatRoomId
        dispute.negotiationRoom = {
          startedAt: new Date(),
          deadline: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 ngày
          chatRoomId: chatRoom._id,
          messages: [],
          finalAgreement: null
        };
        
        dispute.timeline.push({
          action: 'RESPONDENT_REJECTED',
          performedBy: respondentId,
          details: `Respondent từ chối: ${reason}. Bắt đầu đàm phán.`,
          timestamp: new Date()
        });
      } else {
        // Renter khiếu nại, owner từ chối -> Admin xem xét
        dispute.status = 'RESPONDENT_REJECTED';
        
        dispute.timeline.push({
          action: 'RESPONDENT_REJECTED',
          performedBy: respondentId,
          details: `Respondent từ chối: ${reason}. Chờ Admin xem xét.`,
          timestamp: new Date()
        });
      }
    }

    await dispute.save();

    // Gửi notification cho complainant
    try {
      const respondent = await User.findById(respondentId);
      const decisionText = decision === 'ACCEPTED' ? 'chấp nhận' : 'từ chối';
      
      if (decision === 'ACCEPTED') {
        await this._createAndEmitNotification({
          recipient: dispute.complainant,
          type: 'DISPUTE',
          category: 'SUCCESS',
          title: `Tranh chấp đã có phản hồi`,
          message: `${respondent.profile?.fullName || 'Bên bị khiếu nại'} đã ${decisionText} tranh chấp của bạn.`,
          relatedDispute: dispute._id,
          actions: [{
            label: 'Xem chi tiết',
            url: `/disputes/${dispute._id}`,
            action: 'VIEW_DISPUTE'
          }],
          data: {
            disputeId: dispute.disputeId,
            decision
          },
          status: 'SENT'
        });
      } else {
        // Từ chối
        if (dispute.shipmentType === 'RETURN') {
          // Owner khiếu nại, renter từ chối -> Đàm phán
          await this._createAndEmitNotification({
            recipient: dispute.complainant,
            type: 'DISPUTE',
            category: 'INFO',
            title: `Cần đàm phán tranh chấp`,
            message: `${respondent.profile?.fullName || 'Bên bị khiếu nại'} đã từ chối. Vui lòng đàm phán để tìm ra giải pháp chung.`,
            relatedDispute: dispute._id,
            actions: [{
              label: 'Tham gia đàm phán',
              url: `/disputes/${dispute._id}`,
              action: 'NEGOTIATE'
            }],
            data: {
              disputeId: dispute.disputeId,
              decision
            },
            status: 'SENT'
          });
          
          await this._createAndEmitNotification({
            recipient: respondentId,
            type: 'DISPUTE',
            category: 'INFO',
            title: `Bắt đầu đàm phán`,
            message: `Bạn đã từ chối tranh chấp. Vui lòng đàm phán với ${(await User.findById(dispute.complainant)).profile?.fullName || 'bên khiếu nại'} để tìm giải pháp.`,
            relatedDispute: dispute._id,
            actions: [{
              label: 'Tham gia đàm phán',
              url: `/disputes/${dispute._id}`,
              action: 'NEGOTIATE'
            }],
            data: {
              disputeId: dispute.disputeId,
              decision
            },
            status: 'SENT'
          });
        } else {
          // Renter khiếu nại, owner từ chối -> Admin xem xét
          await this._createAndEmitNotification({
            recipient: dispute.complainant,
            type: 'DISPUTE',
            category: 'INFO',
            title: `Tranh chấp đã có phản hồi`,
            message: `${respondent.profile?.fullName || 'Bên bị khiếu nại'} đã từ chối. Admin sẽ xem xét và đưa ra quyết định.`,
            relatedDispute: dispute._id,
            actions: [{
              label: 'Xem chi tiết',
              url: `/disputes/${dispute._id}`,
              action: 'VIEW_DISPUTE'
            }],
            data: {
              disputeId: dispute.disputeId,
              decision
            },
            status: 'SENT'
          });
        }
      }
    } catch (error) {
      console.error('Failed to create respondent response notification:', error);
    }

    return dispute.populate(['complainant', 'respondent']);
  }

  /**
   * Admin xem xét và đưa ra quyết định sơ bộ
   * @param {String} disputeId - ID của dispute
   * @param {String} adminId - ID của admin
   * @param {Object} decision - Quyết định
   * @returns {Promise<Dispute>}
   */
  async adminReview(disputeId, adminId, decision) {
    const { decisionText, reasoning, shipperEvidence, whoIsRight } = decision;

    const dispute = await Dispute.findOne(this._buildDisputeQuery(disputeId));
    if (!dispute) {
      throw new Error('Dispute không tồn tại');
    }

    if (dispute.status !== 'RESPONDENT_REJECTED') {
      throw new Error('Dispute phải ở trạng thái RESPONDENT_REJECTED');
    }

    // Kiểm tra admin role
    const admin = await User.findById(adminId);
    if (!admin || admin.role !== 'ADMIN') {
      throw new Error('Chỉ admin mới có quyền xem xét dispute');
    }

    // Cập nhật admin decision
    dispute.assignedAdmin = adminId;
    dispute.status = 'ADMIN_DECISION_MADE';
    dispute.adminDecision = {
      decision: decisionText,
      reasoning,
      decidedAt: new Date(),
      decidedBy: adminId,
      shipperEvidence: shipperEvidence || {},
      whoIsRight: whoIsRight || null, // 'COMPLAINANT_RIGHT' hoặc 'RESPONDENT_RIGHT'
      complainantAccepted: null,
      respondentAccepted: null
    };

    dispute.timeline.push({
      action: 'ADMIN_DECISION_MADE',
      performedBy: adminId,
      details: `Admin đưa ra quyết định: ${decisionText}`,
      timestamp: new Date()
    });

    await dispute.save();

    // Gửi notification cho cả 2 bên
    try {
      const admin = await User.findById(adminId);
      const notificationData = {
        type: 'DISPUTE',
        category: 'INFO',
        title: 'Admin đã xem xét tranh chấp',
        message: `Admin ${admin.profile?.fullName || 'hệ thống'} đã đưa ra quyết định sơ bộ. Vui lòng xem xét và phản hồi.`,
        relatedDispute: dispute._id,
        actions: [{
          label: 'Xem chi tiết',
          url: `/disputes/${dispute._id}`,
          action: 'VIEW_DISPUTE'
        }],
        data: {
          disputeId: dispute.disputeId,
          adminDecision: decisionText
        },
        status: 'SENT'
      };

      await Promise.all([
        this._createAndEmitNotification({
          ...notificationData,
          recipient: dispute.complainant
        }),
        this._createAndEmitNotification({
          ...notificationData,
          recipient: dispute.respondent
        })
      ]);
    } catch (error) {
      console.error('Failed to create admin review notification:', error);
    }

    return dispute.populate(['complainant', 'respondent', 'assignedAdmin']);
  }

  /**
   * Complainant/Respondent phản hồi quyết định của admin
   * @param {String} disputeId - ID của dispute
   * @param {String} userId - ID của user
   * @param {Boolean} accepted - Chấp nhận hay không
   * @returns {Promise<Dispute>}
   */
  async respondToAdminDecision(disputeId, userId, accepted) {
    const dispute = await Dispute.findOne(this._buildDisputeQuery(disputeId));
    if (!dispute) {
      throw new Error('Dispute không tồn tại');
    }

    if (dispute.status !== 'ADMIN_DECISION_MADE') {
      throw new Error('Admin chưa đưa ra quyết định');
    }

    const isComplainant = dispute.complainant.toString() === userId.toString();
    const isRespondent = dispute.respondent.toString() === userId.toString();

    if (!isComplainant && !isRespondent) {
      throw new Error('Không có quyền phản hồi quyết định này');
    }

    // Cập nhật acceptance
    if (isComplainant) {
      dispute.adminDecision.complainantAccepted = accepted;
      dispute.timeline.push({
        action: accepted ? 'COMPLAINANT_ACCEPTED_ADMIN_DECISION' : 'COMPLAINANT_REJECTED_ADMIN_DECISION',
        performedBy: userId,
        details: accepted ? 'Complainant chấp nhận quyết định admin' : 'Complainant từ chối quyết định admin',
        timestamp: new Date()
      });
    } else {
      dispute.adminDecision.respondentAccepted = accepted;
      dispute.timeline.push({
        action: accepted ? 'RESPONDENT_ACCEPTED_ADMIN_DECISION' : 'RESPONDENT_REJECTED_ADMIN_DECISION',
        performedBy: userId,
        details: accepted ? 'Respondent chấp nhận quyết định admin' : 'Respondent từ chối quyết định admin',
        timestamp: new Date()
      });
    }

    // Kiểm tra xem cả 2 bên đã phản hồi chưa
    if (dispute.adminDecision.complainantAccepted !== null && 
        dispute.adminDecision.respondentAccepted !== null) {
      
      if (dispute.adminDecision.complainantAccepted && 
          dispute.adminDecision.respondentAccepted) {
        // Cả 2 bên đồng ý -> RESOLVED
        dispute.status = 'RESOLVED';
        dispute.resolution = {
          resolvedBy: dispute.assignedAdmin,
          resolvedAt: new Date(),
          resolutionText: dispute.adminDecision.decision,
          resolutionSource: 'ADMIN_DECISION'
        };

        // Xử lý tiền dựa trên quyết định của admin
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
          // Lấy whoIsRight từ adminDecision
          const whoIsRight = dispute.adminDecision.whoIsRight;

          if (whoIsRight) {
            const financialDetails = await this._processDisputeFinancials(dispute, whoIsRight, session);
            if (financialDetails) {
              dispute.resolution.financialImpact = financialDetails;
            }
          }
        
          dispute.timeline.push({
            action: 'BOTH_ACCEPTED',
            performedBy: userId,
            details: 'Cả 2 bên đã chấp nhận quyết định admin' + (whoIsRight ? ` - Xử lý tiền: ${whoIsRight}` : ''),
            timestamp: new Date()
          });

          // Cập nhật credit/loyalty dựa trên whoIsRight
          if (whoIsRight === 'COMPLAINANT_RIGHT') {
            await this._updateUserScoresAfterResolve(dispute.complainant, dispute.respondent, session);
          } else if (whoIsRight === 'RESPONDENT_RIGHT') {
            await this._updateUserScoresAfterResolve(dispute.respondent, dispute.complainant, session);
          }

          await dispute.save({ session });
          await session.commitTransaction();
          session.endSession();

          // Gửi notification cho bên kia
          try {
            const user = await User.findById(userId);
            const otherParty = isComplainant ? dispute.respondent : dispute.complainant;
            const roleText = isComplainant ? 'Người khiếu nại' : 'Bên bị khiếu nại';
            
            await this._createAndEmitNotification({
              recipient: otherParty,
              type: 'DISPUTE',
              category: 'SUCCESS',
              title: 'Dispute đã được giải quyết',
              message: `${roleText} đã chấp nhận quyết định admin. Dispute đã được giải quyết.`,
              relatedDispute: dispute._id,
              actions: [{
                label: 'Xem chi tiết',
                url: `/disputes/${dispute._id}`,
                action: 'VIEW_DISPUTE'
              }],
              data: {
                disputeId: dispute.disputeId,
                accepted: true
              },
              status: 'SENT'
            });
          } catch (error) {
            console.error('Failed to create admin decision response notification:', error);
          }

          return dispute.populate(['complainant', 'respondent', 'assignedAdmin']);
        } catch (error) {
          await session.abortTransaction();
          session.endSession();
          throw error;
        }
      } else {
        // Có ít nhất 1 bên không đồng ý -> Tự động tạo negotiation room
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
        
        dispute.status = 'IN_NEGOTIATION';
        
        dispute.timeline.push({
          action: 'NEGOTIATION_STARTED',
          performedBy: userId,
          details: `Tự động mở phòng đàm phán, hạn chót: ${deadline.toISOString()}`,
          timestamp: new Date()
        });

        await dispute.save();

        // Gửi notification cho bên kia
        try {
          const user = await User.findById(userId);
          const otherParty = isComplainant ? dispute.respondent : dispute.complainant;
          const roleText = isComplainant ? 'Người khiếu nại' : 'Bên bị khiếu nại';
          
          await this._createAndEmitNotification({
            recipient: otherParty,
            type: 'DISPUTE',
            category: 'INFO',
            title: 'Phản hồi quyết định admin',
            message: `${roleText} ${user.profile?.fullName || ''} đã từ chối quyết định của admin. Bắt đầu đàm phán.`,
            relatedDispute: dispute._id,
            actions: [{
              label: 'Xem chi tiết',
              url: `/disputes/${dispute._id}`,
              action: 'VIEW_DISPUTE'
            }],
            data: {
              disputeId: dispute.disputeId,
              accepted
            },
            status: 'SENT'
          });
        } catch (error) {
          console.error('Failed to create admin decision response notification:', error);
        }

        return dispute.populate(['complainant', 'respondent', 'assignedAdmin']);
      }
    } else {
      // Chỉ 1 bên phản hồi, chưa đủ 2 bên -> Save và chờ bên còn lại
      await dispute.save();

      // Gửi notification cho bên kia
      try {
        const user = await User.findById(userId);
        const otherParty = isComplainant ? dispute.respondent : dispute.complainant;
        const roleText = isComplainant ? 'Người khiếu nại' : 'Bên bị khiếu nại';
        const decisionText = accepted ? 'chấp nhận' : 'từ chối';
        
        await this._createAndEmitNotification({
          recipient: otherParty,
          type: 'DISPUTE',
          category: 'INFO',
          title: 'Phản hồi quyết định admin',
          message: `${roleText} ${user.profile?.fullName || ''} đã ${decisionText} quyết định của admin.`,
          relatedDispute: dispute._id,
          actions: [{
            label: 'Xem chi tiết',
            url: `/disputes/${dispute._id}`,
            action: 'VIEW_DISPUTE'
          }],
          data: {
            disputeId: dispute.disputeId,
            accepted
          },
          status: 'SENT'
        });
      } catch (error) {
        console.error('Failed to create admin decision response notification:', error);
      }
    }

    return dispute.populate(['complainant', 'respondent', 'assignedAdmin']);
  }

  /**
   * Lấy danh sách disputes
   * @param {Object} filters - Bộ lọc
   * @returns {Promise<Array>}
   */
  async getDisputes(filters = {}) {
    const query = {};

    if (filters.userId) {
      query.$or = [
        { complainant: filters.userId },
        { respondent: filters.userId }
      ];
    }

    if (filters.status) {
      query.status = filters.status;
    }

    if (filters.shipmentType) {
      query.shipmentType = filters.shipmentType;
    }

    if (filters.subOrderId) {
      query.subOrder = filters.subOrderId;
    }

    const disputes = await Dispute.find(query)
      .populate('complainant', 'profile email')
      .populate('respondent', 'profile email')
      .populate('assignedAdmin', 'profile email')
      .populate('subOrder')
      .sort({ createdAt: -1 });

    return disputes;
  }

  /**
   * Lấy chi tiết dispute
   * @param {String} disputeId - ID của dispute
   * @returns {Promise<Dispute>}
   */
  async getDisputeDetail(disputeId) {
    const dispute = await Dispute.findOne(this._buildDisputeQuery(disputeId))
      .populate({
        path: 'complainant',
        select: 'profile email phone bankAccount wallet',
        populate: { path: 'wallet' }
      })
      .populate({
        path: 'respondent',
        select: 'profile email phone bankAccount wallet',
        populate: { path: 'wallet' }
      })
      .populate('assignedAdmin', 'profile email')
      .populate({
        path: 'subOrder',
        populate: [
          { path: 'owner', select: 'profile email phone' },
          { path: 'masterOrder', populate: { path: 'renter', select: 'profile email phone' } },
          { path: 'products.product' }
        ]
      })
      .populate('negotiationRoom.chatRoomId')
      .populate('thirdPartyResolution.evidence.uploadedBy', 'profile email')
      .populate('thirdPartyResolution.escalatedBy', 'profile email');

    if (!dispute) {
      throw new Error('Dispute không tồn tại');
    }

    return dispute;
  }

  /**
   * Admin xử lý tranh chấp lỗi shipper
   * @param {String} disputeId - ID của dispute
   * @param {String} adminId - ID của admin
   * @param {Object} resolution - Thông tin giải quyết
   * @returns {Promise<Dispute>}
   */
  async resolveShipperDamage(disputeId, adminId, resolution) {
    const { solution, reasoning, shipperEvidence, insuranceClaim, refundAmount, compensationAmount } = resolution;

    const dispute = await Dispute.findOne(this._buildDisputeQuery(disputeId))
      .populate('complainant')
      .populate('respondent')
      .populate({
        path: 'subOrder',
        populate: [
          { path: 'owner' },
          { path: 'masterOrder', populate: { path: 'renter' } }
        ]
      });

    if (!dispute) {
      throw new Error('Dispute không tồn tại');
    }

    // Kiểm tra status và type
    if (dispute.status !== 'ADMIN_REVIEW') {
      throw new Error('Dispute phải ở trạng thái ADMIN_REVIEW');
    }

    if (dispute.type !== 'DAMAGED_BY_SHIPPER') {
      throw new Error('Chỉ áp dụng cho dispute loại DAMAGED_BY_SHIPPER');
    }

    // Kiểm tra admin role
    const admin = await User.findById(adminId);
    if (!admin || admin.role !== 'ADMIN') {
      throw new Error('Chỉ admin mới có quyền xử lý');
    }

    // Cập nhật admin decision
    dispute.assignedAdmin = adminId;
    dispute.status = 'RESOLVED';
    dispute.adminDecision = {
      decision: solution === 'REPLACEMENT' 
        ? 'Gửi hàng thay thế - Shipper chịu trách nhiệm'
        : 'Hoàn tiền + Hủy đơn - Shipper chịu trách nhiệm',
      reasoning,
      decidedAt: new Date(),
      decidedBy: adminId,
      shipperEvidence: shipperEvidence || {},
      insuranceClaim: insuranceClaim
    };

    // Add timeline
    dispute.timeline.push({
      action: 'SHIPPER_DAMAGE_RESOLVED',
      performedBy: adminId,
      details: `Admin xác định lỗi shipper. Giải pháp: ${solution === 'REPLACEMENT' ? 'Gửi hàng thay thế' : 'Hoàn tiền + Hủy đơn'}`,
      timestamp: new Date()
    });

    await dispute.save();

    // TODO: Execute financial transactions based on solution
    // - REPLACEMENT: No transactions for owner/renter, charge shipper
    // - REFUND_CANCEL: Refund renter, compensate owner, charge shipper

    // Gửi notification cho cả 2 bên
    try {
      const solutionText = solution === 'REPLACEMENT' 
        ? 'gửi hàng thay thế' 
        : 'hoàn tiền và hủy đơn';

      const notificationData = {
        type: 'DISPUTE',
        category: 'SUCCESS',
        title: 'Tranh chấp đã được giải quyết',
        message: `Admin xác nhận lỗi do shipper. Giải pháp: ${solutionText}. Credit score của bạn không bị ảnh hưởng.`,
        relatedDispute: dispute._id,
        relatedOrder: dispute.subOrder.masterOrder._id,
        actions: [{
          label: 'Xem chi tiết',
          url: `/disputes/${dispute._id}`,
          action: 'VIEW_DISPUTE'
        }],
        data: {
          disputeId: dispute.disputeId,
          solution,
          noImpact: true
        },
        status: 'SENT'
      };

      // Gửi cho complainant
      await this._createAndEmitNotification({
        ...notificationData,
        recipient: dispute.complainant._id
      });

      // Gửi cho respondent
      await this._createAndEmitNotification({
        ...notificationData,
        recipient: dispute.respondent._id
      });
    } catch (error) {
      console.error('Failed to send resolution notifications:', error);
    }

    return dispute.populate(['complainant', 'respondent', 'assignedAdmin']);
  }

  /**
   * Admin xử lý thanh toán từ ví + tiền cọc
   * @param {String} disputeId - ID của dispute
   * @param {String} adminId - ID của admin
   * @param {Object} paymentData - { repairCost, depositAmount, additionalRequired }
   * @returns {Promise<Dispute>}
   */
  async adminProcessPayment(disputeId, adminId, paymentData) {
    const dispute = await Dispute.findOne(this._buildDisputeQuery(disputeId))
      .populate('complainant')
      .populate('respondent')
      .populate('subOrder')
      .populate('assignedAdmin');

    if (!dispute) {
      throw new Error('Dispute không tồn tại');
    }

    // Chỉ xử lý khi status là RESPONDENT_ACCEPTED
    if (dispute.status !== 'RESPONDENT_ACCEPTED') {
      throw new Error(`Không thể xử lý thanh toán ở trạng thái ${dispute.status}`);
    }

    const { repairCost, depositAmount, additionalRequired } = paymentData;

    // Lấy thông tin renter (respondent) và owner (complainant)
    const renter = await User.findById(dispute.respondent._id).populate('wallet');
    const owner = await User.findById(dispute.complainant._id).populate('wallet');

    if (!renter || !owner) {
      throw new Error('Không tìm thấy thông tin người dùng');
    }

    // Kiểm tra số dư ví + tiền cọc
    const renterAvailableBalance = renter.wallet?.balance?.available || 0;
    const totalAvailable = renterAvailableBalance + depositAmount;
    if (totalAvailable < repairCost) {
      throw new Error(`Renter chưa đủ tiền. Cần: ${repairCost.toLocaleString('vi-VN')}đ, Có: ${totalAvailable.toLocaleString('vi-VN')}đ (Ví: ${renterAvailableBalance.toLocaleString('vi-VN')}đ + Cọc: ${depositAmount.toLocaleString('vi-VN')}đ)`);
    }

    const Wallet = require('../models/Wallet');
    const SystemWallet = require('../models/SystemWallet');
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // 1. Trừ tiền cọc từ system wallet (available balance)
      let remainingCost = repairCost;
      const depositUsed = Math.min(depositAmount, repairCost);
      
      if (depositUsed > 0) {
        const systemWallet = await SystemWallet.findOne({}).session(session);
        if (!systemWallet) {
          throw new Error('Không tìm thấy system wallet');
        }

        if (systemWallet.balance.available < depositUsed) {
          throw new Error(`System wallet không đủ tiền cọc. Available: ${systemWallet.balance.available.toLocaleString('vi-VN')}đ, Cần: ${depositUsed.toLocaleString('vi-VN')}đ`);
        }

        // Trừ từ available balance của system wallet
        systemWallet.balance.available -= depositUsed;
        await systemWallet.save({ session });
      }
      
      remainingCost -= depositUsed;

      // 2. Nếu còn thiếu, trừ từ ví renter
      if (remainingCost > 0) {
        const renterWallet = await Wallet.findById(renter.wallet._id).session(session);
        
        if (!renterWallet) {
          throw new Error('Không tìm thấy ví của renter');
        }

        const availableBalance = renterWallet.balance?.available || 0;
        
        if (availableBalance < remainingCost) {
          throw new Error(`Ví không đủ tiền. Cần: ${remainingCost.toLocaleString('vi-VN')}đ, Có: ${availableBalance.toLocaleString('vi-VN')}đ`);
        }

        // Deduct from available balance
        renterWallet.balance.available -= remainingCost;
        renterWallet.balance.display = (renterWallet.balance.available || 0) + (renterWallet.balance.frozen || 0) + (renterWallet.balance.pending || 0);
        await renterWallet.save({ session });
      }

      // 3. Chuyển tiền cho owner
      let ownerWallet = await Wallet.findById(owner.wallet._id);
      
      if (!ownerWallet) {
        // Create wallet if not exists
        ownerWallet = new Wallet({
          user: owner._id,
          balance: { available: 0, frozen: 0, pending: 0, display: 0 },
          currency: 'VND',
          status: 'ACTIVE'
        });
      }
      
      ownerWallet.balance.available += repairCost;
      ownerWallet.balance.display = (ownerWallet.balance.available || 0) + (ownerWallet.balance.frozen || 0) + (ownerWallet.balance.pending || 0);
      await ownerWallet.save({ session });

      // 4. Cập nhật dispute
      dispute.status = 'RESOLVED';
      dispute.resolution = {
        decision: 'ACCEPT_REPAIR_COST',
        resolutionSource: 'ADMIN_PROCESSED_PAYMENT',
        resolvedBy: adminId,
        resolvedAt: new Date(),
        notes: `Admin đã xử lý thanh toán:\n` +
               `- Chi phí sửa chữa: ${repairCost.toLocaleString('vi-VN')}đ\n` +
               `- Trừ từ tiền cọc: ${depositUsed.toLocaleString('vi-VN')}đ\n` +
               (remainingCost > 0 ? `- Trừ từ ví: ${remainingCost.toLocaleString('vi-VN')}đ\n` : '') +
               `- Đã chuyển ${repairCost.toLocaleString('vi-VN')}đ cho owner`
      };

      dispute.timeline.push({
        action: 'ADMIN_PROCESSED_PAYMENT',
        actor: adminId,
        details: `Admin xử lý thanh toán thành công. Trừ ${depositUsed.toLocaleString('vi-VN')}đ từ cọc${remainingCost > 0 ? ` + ${remainingCost.toLocaleString('vi-VN')}đ từ ví` : ''}. Chuyển ${repairCost.toLocaleString('vi-VN')}đ cho owner.`,
        timestamp: new Date()
      });

      // Cập nhật credit/loyalty: Renter sai (phải trả repair cost)
      await this._updateUserScoresAfterResolve(owner._id, renter._id, session);

      await dispute.save({ session });

      await session.commitTransaction();
      session.endSession();

      // Reload dispute with populated fields
      const updatedDispute = await Dispute.findById(dispute._id)
        .populate('complainant', 'profile email')
        .populate('respondent', 'profile email')
        .populate('assignedAdmin', 'profile email');

      // Gửi notification
      try {
        // Notification cho renter
        await this._createAndEmitNotification({
          recipient: renter._id,
          type: 'DISPUTE_RESOLVED',
          title: 'Dispute đã được giải quyết',
          message: `Admin đã xử lý thanh toán cho dispute ${dispute.disputeId}. Đã trừ ${depositUsed.toLocaleString('vi-VN')}đ từ cọc${remainingCost > 0 ? ` và ${remainingCost.toLocaleString('vi-VN')}đ từ ví` : ''}.`,
          relatedModel: 'Dispute',
          relatedId: dispute._id,
          actionButtons: [{
            label: 'Xem chi tiết',
            url: `/disputes/${dispute._id}`,
            action: 'VIEW_DISPUTE'
          }],
          status: 'SENT'
        });

        // Notification cho owner
        await this._createAndEmitNotification({
          recipient: owner._id,
          type: 'DISPUTE_RESOLVED',
          title: 'Dispute đã được giải quyết',
          message: `Admin đã xử lý thanh toán cho dispute ${dispute.disputeId}. Bạn đã nhận ${repairCost.toLocaleString('vi-VN')}đ tiền sửa chữa.`,
          relatedModel: 'Dispute',
          relatedId: dispute._id,
          actionButtons: [{
            label: 'Xem chi tiết',
            url: `/disputes/${dispute._id}`,
            action: 'VIEW_DISPUTE'
          }],
          status: 'SENT'
        });
      } catch (notifError) {
        console.error('Failed to send payment notifications:', notifError);
      }

      return updatedDispute;

    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      throw error;
    }
  }

  /**
   * Admin quyết định cuối cùng cho owner dispute dựa trên kết quả bên thứ 3
   * @param {String} disputeId - ID của dispute
   * @param {String} adminId - ID của admin
   * @param {Object} decisionData - { decision, compensationAmount, reasoning }
   * @returns {Promise<Dispute>}
   */
  async adminFinalDecisionOwnerDispute(disputeId, adminId, decisionData) {
    const dispute = await Dispute.findOne(this._buildDisputeQuery(disputeId))
      .populate('complainant')
      .populate('respondent')
      .populate('subOrder');

    if (!dispute) {
      throw new Error('Dispute không tồn tại');
    }

    // Cho phép xử lý cả đàm phán và bên thứ 3
    if (dispute.status !== 'THIRD_PARTY_EVIDENCE_UPLOADED' && dispute.status !== 'NEGOTIATION_AGREED') {
      throw new Error('Dispute phải có kết quả từ bên thứ 3 hoặc đã thỏa thuận đàm phán');
    }

    if (dispute.shipmentType !== 'RETURN') {
      throw new Error('Chức năng này chỉ dành cho owner dispute');
    }

    const { decision, compensationAmount, reasoning } = decisionData;

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      if (decision === 'COMPLAINANT_RIGHT') {
        // Owner đúng (renter có lỗi) -> Renter phải bồi thường
        const product = dispute.subOrder.products[dispute.productIndex];
        const depositAmount = product.totalDeposit || 0;
        const amount = parseFloat(compensationAmount);

        if (!amount || amount <= 0) {
          throw new Error('Số tiền bồi thường không hợp lệ');
        }

        const renterWallet = await Wallet.findById(dispute.respondent.wallet).session(session);
        const ownerWallet = await Wallet.findById(dispute.complainant.wallet).session(session);

        if (!renterWallet) {
          throw new Error('Không tìm thấy ví của renter');
        }

        if (!ownerWallet) {
          // Tạo ví cho owner nếu chưa có
          const newWallet = new Wallet({
            user: dispute.complainant._id,
            balance: { available: 0, frozen: 0, pending: 0, display: 0 },
            currency: 'VND',
            status: 'ACTIVE'
          });
          await newWallet.save({ session });
          ownerWallet = newWallet;
        }

        // Kiểm tra renter có đủ tiền không (ví + deposit)
        if (renterWallet.balance.available + depositAmount < amount) {
          throw new Error(`Renter không đủ số dư. Hiện có: ${(renterWallet.balance.available + depositAmount).toLocaleString('vi-VN')}đ, cần: ${amount.toLocaleString('vi-VN')}đ`);
        }

        // 1. Trừ tiền cọc từ system wallet trước
        const depositUsed = Math.min(depositAmount, amount);
        
        if (depositUsed > 0) {
          const systemWallet = await SystemWallet.findOne({}).session(session);
          if (!systemWallet) {
            throw new Error('Không tìm thấy system wallet');
          }

          if (systemWallet.balance.available < depositUsed) {
            throw new Error(`System wallet không đủ tiền cọc. Available: ${systemWallet.balance.available.toLocaleString('vi-VN')}đ, Cần: ${depositUsed.toLocaleString('vi-VN')}đ`);
          }

          // Trừ từ available balance của system wallet
          systemWallet.balance.available -= depositUsed;
          await systemWallet.save({ session });
        }

        const remainingCost = Math.max(0, amount - depositAmount);

        // 2. Nếu còn thiếu thì trừ từ ví renter
        if (remainingCost > 0) {
          if (renterWallet.balance.available < remainingCost) {
            throw new Error('Số dư ví không đủ');
          }
          renterWallet.balance.available -= remainingCost;
          renterWallet.balance.display = (renterWallet.balance.available || 0) + (renterWallet.balance.frozen || 0) + (renterWallet.balance.pending || 0);
          await renterWallet.save({ session });
        }

        // 3. Chuyển tiền cho owner
        ownerWallet.balance.available += amount;
        ownerWallet.balance.display = (ownerWallet.balance.available || 0) + (ownerWallet.balance.frozen || 0) + (ownerWallet.balance.pending || 0);
        await ownerWallet.save({ session });

        dispute.status = 'RESOLVED';
        dispute.resolution = {
          decision: 'COMPLAINANT_RIGHT',
          resolutionSource: 'THIRD_PARTY',
          resolvedBy: adminId,
          resolvedAt: new Date(),
          notes: `Admin xác định owner đúng, renter có lỗi.\n` +
                 `Renter phải bồi thường: ${amount.toLocaleString('vi-VN')}đ\n` +
                 `- Trừ từ tiền cọc: ${depositUsed.toLocaleString('vi-VN')}đ\n` +
                 (remainingCost > 0 ? `- Trừ từ ví: ${remainingCost.toLocaleString('vi-VN')}đ\n` : '') +
                 `Lý do: ${reasoning}`
        };

        dispute.timeline.push({
          action: 'ADMIN_FINAL_DECISION',
          actor: adminId,
          details: `Admin quyết định: Owner đúng. Renter bồi thường ${amount.toLocaleString('vi-VN')}đ cho owner.`,
          timestamp: new Date()
        });

        // Cập nhật credit/loyalty: Owner đúng, renter sai
        await this._updateUserScoresAfterResolve(dispute.complainant, dispute.respondent, session);

      } else if (decision === 'RESPONDENT_RIGHT') {
        // Renter đúng (owner không có lý do chính đáng) -> Chỉ hoàn tiền cọc
        // KHÔNG hoàn tiền thuê vì renter đã sử dụng sản phẩm
        const product = dispute.subOrder.products[dispute.productIndex];
        const depositAmount = product.totalDeposit || 0;

        const renterWallet = await Wallet.findById(dispute.respondent.wallet).session(session);
        const systemWallet = await SystemWallet.findOne({}).session(session);

        if (!renterWallet) {
          throw new Error('Không tìm thấy ví của renter');
        }

        if (!systemWallet) {
          throw new Error('Không tìm thấy system wallet');
        }

        // Kiểm tra system wallet có đủ tiền cọc không
        if (systemWallet.balance.available < depositAmount) {
          throw new Error(`System wallet không đủ tiền cọc để hoàn. Available: ${systemWallet.balance.available.toLocaleString('vi-VN')}đ, Cần: ${depositAmount.toLocaleString('vi-VN')}đ`);
        }

        // Hoàn tiền cọc từ system wallet cho renter
        systemWallet.balance.available -= depositAmount;
        await systemWallet.save({ session });

        renterWallet.balance.available += depositAmount;
        renterWallet.balance.display = (renterWallet.balance.available || 0) + (renterWallet.balance.frozen || 0) + (renterWallet.balance.pending || 0);
        await renterWallet.save({ session });

        dispute.status = 'RESOLVED';
        dispute.resolution = {
          decision: 'RESPONDENT_RIGHT',
          resolutionSource: dispute.status === 'NEGOTIATION_AGREED' ? 'NEGOTIATION' : 'THIRD_PARTY',
          resolvedBy: adminId,
          resolvedAt: new Date(),
          notes: `Admin xác định renter đúng, owner không có lý do chính đáng.\n` +
                 `Renter được hoàn 100% tiền cọc: ${depositAmount.toLocaleString('vi-VN')}đ\n` +
                 `(Tiền thuê không hoàn vì renter đã sử dụng sản phẩm)\n` +
                 `Lý do: ${reasoning}`
        };

        dispute.timeline.push({
          action: 'ADMIN_FINAL_DECISION',
          actor: adminId,
          details: `Admin quyết định: Renter đúng. Hoàn 100% tiền cọc ${depositAmount.toLocaleString('vi-VN')}đ cho renter.`,
          timestamp: new Date()
        });
      }

      // Cập nhật credit/loyalty dựa trên decision
      if (decision === 'COMPLAINANT_RIGHT') {
        // Owner đúng, renter sai
        await this._updateUserScoresAfterResolve(dispute.complainant, dispute.respondent, session);
      } else if (decision === 'RESPONDENT_RIGHT') {
        // Renter đúng, owner sai
        await this._updateUserScoresAfterResolve(dispute.respondent, dispute.complainant, session);
      }

      await dispute.save({ session });
      await session.commitTransaction();
      session.endSession();

      // Reload dispute
      const updatedDispute = await Dispute.findById(dispute._id)
        .populate('complainant', 'profile email')
        .populate('respondent', 'profile email')
        .populate('assignedAdmin', 'profile email');

      // Gửi notification
      try {
        const product = dispute.subOrder.products[dispute.productIndex];
        
        if (decision === 'COMPLAINANT_RIGHT') {
          await this._createAndEmitNotification({
            recipient: dispute.respondent._id,
            type: 'DISPUTE_RESOLVED',
            title: 'Dispute đã được giải quyết',
            message: `Admin xác định bạn có lỗi. Đã trừ ${compensationAmount.toLocaleString('vi-VN')}đ để bồi thường cho owner.`,
            relatedModel: 'Dispute',
            relatedId: dispute._id,
            status: 'SENT'
          });

          await this._createAndEmitNotification({
            recipient: dispute.complainant._id,
            type: 'DISPUTE_RESOLVED',
            title: 'Dispute đã được giải quyết',
            message: `Admin xác định renter có lỗi. Bạn đã nhận ${compensationAmount.toLocaleString('vi-VN')}đ tiền bồi thường.`,
            relatedModel: 'Dispute',
            relatedId: dispute._id,
            status: 'SENT'
          });
        } else {
          const totalRefund = (product.totalDeposit + product.totalRental);
          
          await this._createAndEmitNotification({
            recipient: dispute.respondent._id,
            type: 'DISPUTE_RESOLVED',
            title: 'Dispute đã được giải quyết',
            message: `Admin xác định bạn không có lỗi. Bạn được hoàn ${totalRefund.toLocaleString('vi-VN')}đ.`,
            relatedModel: 'Dispute',
            relatedId: dispute._id,
            status: 'SENT'
          });

          await this._createAndEmitNotification({
            recipient: dispute.complainant._id,
            type: 'DISPUTE_RESOLVED',
            title: 'Dispute đã được giải quyết',
            message: `Admin xác định renter không có lỗi. Dispute đã được đóng.`,
            relatedModel: 'Dispute',
            relatedId: dispute._id,
            status: 'SENT'
          });
        }
      } catch (notifError) {
        console.error('Failed to send decision notifications:', notifError);
      }

      return updatedDispute;

    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      throw error;
    }
  }

  /**
   * Renter đề xuất reschedule cho dispute RENTER_NO_RETURN
   * @param {String} disputeId - ID của dispute
   * @param {String} renterId - ID của renter
   * @param {Object} requestData - { proposedReturnDate, reason, evidence }
   * @returns {Promise<Dispute>}
   */
  async renterProposeReschedule(disputeId, renterId, requestData) {
    const { proposedReturnDate, reason, evidence } = requestData;

    const dispute = await Dispute.findOne(this._buildDisputeQuery(disputeId))
      .populate('complainant respondent subOrder');

    if (!dispute) {
      throw new Error('Dispute không tồn tại');
    }

    if (dispute.type !== 'RENTER_NO_RETURN') {
      throw new Error('Chỉ áp dụng cho dispute RENTER_NO_RETURN');
    }

    if (dispute.status !== 'OPEN') {
      throw new Error('Dispute không ở trạng thái OPEN');
    }

    // Kiểm tra quyền - chỉ renter (respondent) mới được đề xuất
    if (dispute.respondent._id.toString() !== renterId.toString()) {
      throw new Error('Chỉ renter mới có quyền đề xuất reschedule');
    }

    // Kiểm tra ngày đề xuất phải sau ngày hiện tại
    const proposedDate = new Date(proposedReturnDate);
    if (proposedDate <= new Date()) {
      throw new Error('Ngày trả hàng đề xuất phải sau ngày hiện tại');
    }

    // Cập nhật reschedule request
    dispute.rescheduleRequest = {
      requestedBy: renterId,
      requestedAt: new Date(),
      proposedReturnDate: proposedDate,
      reason,
      evidence: evidence || {},
      status: 'PENDING',
      ownerResponse: {}
    };

    dispute.timeline.push({
      action: 'RESCHEDULE_REQUESTED',
      performedBy: renterId,
      details: `Renter đề xuất trả hàng vào ${proposedDate.toLocaleDateString('vi-VN')}. Lý do: ${reason}`,
      timestamp: new Date()
    });

    await dispute.save();

    // Gửi notification cho owner
    try {
      const renter = await User.findById(renterId);
      await this._createAndEmitNotification({
        recipient: dispute.complainant,
        type: 'DISPUTE',
        category: 'INFO',
        title: 'Renter đề xuất lịch trả hàng mới',
        message: `${renter.profile?.fullName || 'Renter'} đề xuất trả hàng vào ${proposedDate.toLocaleDateString('vi-VN')}. Lý do: ${reason}`,
        relatedDispute: dispute._id,
        relatedOrder: dispute.subOrder.masterOrder,
        actions: [{
          label: 'Xem chi tiết',
          url: `/disputes/${dispute._id}`,
          action: 'VIEW_RESCHEDULE_REQUEST'
        }],
        data: {
          disputeId: dispute.disputeId,
          proposedReturnDate: proposedDate.toISOString(),
          reason
        },
        status: 'SENT'
      });
    } catch (error) {
      console.error('Failed to send reschedule notification:', error);
    }

    return dispute.populate(['complainant', 'respondent']);
  }

  /**
   * Owner phản hồi reschedule request
   * @param {String} disputeId - ID của dispute
   * @param {String} ownerId - ID của owner
   * @param {Object} responseData - { decision: 'APPROVED'|'REJECTED', reason }
   * @returns {Promise<Dispute>}
   */
  async ownerRespondToReschedule(disputeId, ownerId, responseData) {
    const { decision, reason } = responseData;

    const dispute = await Dispute.findOne(this._buildDisputeQuery(disputeId))
      .populate('complainant respondent subOrder');

    if (!dispute) {
      throw new Error('Dispute không tồn tại');
    }

    if (dispute.type !== 'RENTER_NO_RETURN') {
      throw new Error('Chỉ áp dụng cho dispute RENTER_NO_RETURN');
    }

    if (!dispute.rescheduleRequest || dispute.rescheduleRequest.status !== 'PENDING') {
      throw new Error('Không có reschedule request đang chờ xử lý');
    }

    // Kiểm tra quyền - chỉ owner (complainant) mới được phản hồi
    if (dispute.complainant._id.toString() !== ownerId.toString()) {
      throw new Error('Chỉ owner mới có quyền phản hồi reschedule request');
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    // Biến để lưu thông tin cần dùng sau transaction
    let newShipment = null;
    let penaltyAmount = 0;

    try {
      // Cập nhật owner response
      dispute.rescheduleRequest.status = decision;
      dispute.rescheduleRequest.ownerResponse = {
        decision,
        respondedAt: new Date(),
        reason: reason || ''
      };

      if (decision === 'APPROVED') {
        // Owner chấp nhận reschedule
        // Tạo shipment mới với ngày đã đề xuất
        const Shipment = require('../models/Shipment');
        
        // Lấy thông tin cần thiết từ subOrder
        const subOrder = await SubOrder.findById(dispute.subOrder._id)
          .populate('masterOrder')
          .populate('owner')
          .populate('products.product') // Populate product details
          .session(session);
        
        const masterOrder = subOrder.masterOrder;
        const renter = await User.findById(masterOrder.renter).session(session);
        const owner = subOrder.owner;
        
        // Lấy địa chỉ renter (pickup address)
        const renterAddress = masterOrder.deliveryAddress || {};
        
        // Lấy địa chỉ owner (delivery address)
        const ownerAddress = subOrder.ownerAddress || owner.addresses?.[0] || {};
        
        const productItem = subOrder.products[dispute.productIndex];
        const product = productItem.product; // Populated product
        
        console.log('[Dispute Service] 📦 Creating reschedule shipment for product:', product?.name || 'Unknown');
        
        newShipment = new Shipment({
          shipmentId: generateShipmentId(),
          subOrder: dispute.subOrder._id,
          productId: dispute.productId,
          productIndex: dispute.productIndex,
          shipper: null, // Sẽ được assign sau
          type: 'RETURN',
          returnType: 'NORMAL', // Reschedule vẫn là return bình thường
          fromAddress: {
            streetAddress: renterAddress.streetAddress || '',
            ward: renterAddress.ward || '',
            district: renterAddress.district || '',
            city: renterAddress.city || '',
            province: renterAddress.province || '',
            coordinates: renterAddress.coordinates || {}
          },
          toAddress: {
            streetAddress: ownerAddress.streetAddress || '',
            ward: ownerAddress.ward || '',
            district: ownerAddress.district || '',
            city: ownerAddress.city || '',
            province: ownerAddress.province || '',
            coordinates: ownerAddress.coordinates || {}
          },
          contactInfo: {
            name: renterAddress.contactName || renter.profile?.fullName || 'Renter',
            phone: renterAddress.contactPhone || renter.phone || '',
            notes: `Reschedule từ dispute ${dispute.disputeId} - Trả hàng`
          },
          customerInfo: {
            userId: renter._id,
            name: renter.profile?.fullName || renter.profile?.firstName || 'Renter',
            phone: renter.phone || '',
            email: renter.email || ''
          },
          fee: product.shipping?.fee?.totalFee || 0,
          scheduledAt: dispute.rescheduleRequest.proposedReturnDate,
          status: 'PENDING',
          tracking: {
            notes: `Lịch trả hàng mới sau khi owner chấp nhận reschedule request`
          }
        });
        await newShipment.save({ session });

        // Tạo ShipmentProof cho shipment mới
        const ShipmentProof = require('../models/Shipment_Proof');
        const newShipmentProof = new ShipmentProof({
          shipment: newShipment._id,
          imageBeforeDelivery: '',
          imageAfterDelivery: '',
          notes: `RETURN (Reschedule): ${product.product?.name || 'Product'} | From: ${renter.profile?.fullName || 'Renter'} | To: ${owner.profile?.fullName || 'Owner'} | Date: ${dispute.rescheduleRequest.proposedReturnDate}`
        });
        await newShipmentProof.save({ session });

        dispute.rescheduleRequest.newShipmentId = newShipment._id;

        // Tìm shipper phù hợp (shipper gần nhất hoặc shipper đã giao hàng trước đó)
        // Lấy shipment DELIVERY ban đầu để tìm shipper cũ (Shipment already declared above)
        const originalDeliveryShipment = await Shipment.findOne({
          subOrder: dispute.subOrder._id,
          productId: dispute.productId,
          type: 'DELIVERY'
        }).session(session).populate('shipper');

        let assignedShipperId = null;
        if (originalDeliveryShipment?.shipper) {
          // Ưu tiên assign cho shipper cũ nếu có
          assignedShipperId = originalDeliveryShipment.shipper._id || originalDeliveryShipment.shipper;
          newShipment.shipper = assignedShipperId;
          await newShipment.save({ session });
        }

        // Phạt nhẹ: 10% deposit (productItem already declared above)
        const depositAmount = productItem.totalDeposit || 0;
        penaltyAmount = depositAmount * 0.1;

        // Cập nhật product status using findOneAndUpdate to avoid validation issues
        await SubOrder.findOneAndUpdate(
          { _id: dispute.subOrder._id, 'products.product': dispute.productId },
          { $set: { 'products.$.productStatus': 'RETURNING' } },
          { session }
        );

        // Resolve dispute
        dispute.status = 'RESOLVED';
        dispute.resolution = {
          resolvedBy: ownerId,
          resolvedAt: new Date(),
          resolutionText: `Owner chấp nhận reschedule. Renter phạt 10% deposit (${penaltyAmount.toLocaleString('vi-VN')}đ)`,
          resolutionSource: 'RESCHEDULE_APPROVED',
          financialImpact: {
            penaltyAmount,
            compensationAmount: penaltyAmount,
            paidBy: dispute.respondent._id,
            paidTo: dispute.complainant._id,
            status: 'PENDING'
          }
        };

        // Xử lý tiền phạt từ system wallet (giữ 10% deposit)
        const systemWallet = await SystemWallet.findOne({}).session(session);
        if (systemWallet && systemWallet.balance.available >= penaltyAmount) {
          systemWallet.balance.available -= penaltyAmount;
          await systemWallet.save({ session });

          // Chuyển phạt cho owner
          const ownerWallet = await Wallet.findById(dispute.complainant.wallet).session(session);
          if (ownerWallet) {
            ownerWallet.balance.available += penaltyAmount;
            ownerWallet.balance.display = (ownerWallet.balance.available || 0) + (ownerWallet.balance.frozen || 0) + (ownerWallet.balance.pending || 0);
            await ownerWallet.save({ session });
          }

          dispute.resolution.financialImpact.status = 'COMPLETED';
        }

        // Trừ credit nhẹ: -5
        await User.findByIdAndUpdate(
          dispute.respondent._id,
          { $inc: { creditScore: -5 } },
          { session }
        );

        dispute.timeline.push({
          action: 'RESCHEDULE_APPROVED',
          performedBy: ownerId,
          details: `Owner chấp nhận reschedule. Tạo shipment mới. Phạt 10% deposit: ${penaltyAmount.toLocaleString('vi-VN')}đ. Credit -5.`,
          timestamp: new Date()
        });

      } else {
        // Owner từ chối reschedule → Mở negotiation room để 2 bên thương lượng
        dispute.status = 'IN_NEGOTIATION';
        
        // Tạo negotiation room
        const Chat = require('../models/Chat');
        const negotiationChat = new Chat({
          participants: [dispute.complainant._id, dispute.respondent._id],
          type: 'DISPUTE_NEGOTIATION',
          relatedDispute: dispute._id,
          metadata: {
            disputeType: 'RENTER_NO_RETURN',
            purpose: 'Thương lượng ngày trả hàng',
            originalProposal: dispute.rescheduleRequest.proposedReturnDate,
            ownerRejectionReason: reason
          }
        });
        await negotiationChat.save({ session });
        
        dispute.negotiationRoom = {
          startedAt: new Date(),
          deadline: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 ngày
          chatRoomId: negotiationChat._id
        };
        
        dispute.timeline.push({
          action: 'RESCHEDULE_REJECTED_NEGOTIATION_STARTED',
          performedBy: ownerId,
          details: `Owner từ chối ngày ${new Date(dispute.rescheduleRequest.proposedReturnDate).toLocaleDateString('vi-VN')}. Lý do: ${reason}. Mở phòng thương lượng để 2 bên tự thỏa thuận ngày trả.`,
          timestamp: new Date()
        });
      }

      await dispute.save({ session });
      await session.commitTransaction();
      session.endSession();

      // Gửi notifications BÊN NGOÀI transaction để tránh conflict
      if (decision === 'APPROVED') {
        // Notification cho renter
        await this._createAndEmitNotification({
          recipient: dispute.respondent._id,
          type: 'DISPUTE',
          category: 'SUCCESS',
          title: 'Reschedule được chấp nhận',
          message: `Owner đã chấp nhận đề xuất trả hàng của bạn. Shipment mới đã được tạo. Bạn bị phạt 10% deposit (${penaltyAmount.toLocaleString('vi-VN')}đ) và -5 credit score.`,
          relatedDispute: dispute._id,
          actions: [{
            label: 'Xem shipment mới',
            url: `/shipments/${newShipment._id}`,
            action: 'VIEW_SHIPMENT'
          }],
          status: 'SENT'
        });
      } else {
        // Notification cho renter - Mời vào phòng thương lượng
        await this._createAndEmitNotification({
          recipient: dispute.respondent._id,
          type: 'DISPUTE',
          category: 'INFO',
          title: 'Owner từ chối ngày bạn đề xuất',
          message: `Owner từ chối ngày ${new Date(dispute.rescheduleRequest.proposedReturnDate).toLocaleDateString('vi-VN')}. Lý do: ${reason}. Hãy vào phòng thương lượng để thỏa thuận ngày khác.`,
          relatedDispute: dispute._id,
          actions: [{
            label: 'Vào phòng thương lượng',
            url: `/disputes/${dispute._id}/negotiate`,
            action: 'NEGOTIATE'
          }],
          status: 'SENT'
        });

        // Notification cho owner
        await this._createAndEmitNotification({
          recipient: dispute.complainant._id,
          type: 'DISPUTE',
          category: 'INFO',
          title: 'Đã mở phòng thương lượng',
          message: `Bạn đã từ chối ngày renter đề xuất. Phòng thương lượng đã được mở, hãy thỏa thuận với renter về ngày trả hàng phù hợp.`,
          relatedDispute: dispute._id,
          actions: [{
            label: 'Vào phòng thương lượng',
            url: `/disputes/${dispute._id}/negotiate`,
            action: 'NEGOTIATE'
          }],
          status: 'SENT'
        });
      }

      // Gửi notification và email cho SHIPPER nếu có shipment mới (APPROVED case)
      if (decision === 'APPROVED' && newShipment && newShipment.shipper) {
        try {
          const shipperUser = await User.findById(newShipment.shipper);
          if (shipperUser) {
            // Lấy thông tin product để gửi notification
            const populatedShipment = await newShipment.populate('subOrder');
            const subOrderData = await SubOrder.findById(populatedShipment.subOrder).populate('products.product masterOrder');
            const productItem = subOrderData.products[dispute.productIndex];
            const productData = productItem.product;
            const renterData = await User.findById(subOrderData.masterOrder.renter);
            const ownerData = await User.findById(subOrderData.owner);

            // Tạo notification cho shipper
            const shipperNotification = await notificationService.createNotification({
              recipient: newShipment.shipper,
              title: '📦 Đơn trả hàng mới (Reschedule)',
              message: `Bạn có đơn trả hàng mới: ${productData?.name || 'sản phẩm'} từ ${renterData?.profile?.fullName || 'Renter'} về ${ownerData?.profile?.fullName || 'Owner'}. Dự kiến: ${new Date(dispute.rescheduleRequest.proposedReturnDate).toLocaleDateString('vi-VN')}`,
              type: 'SHIPMENT',
              category: 'INFO',
              data: {
                shipmentId: newShipment.shipmentId,
                shipmentObjectId: newShipment._id,
                shipmentType: 'RETURN',
                productName: productData?.name || 'sản phẩm',
                scheduledAt: dispute.rescheduleRequest.proposedReturnDate,
                isReschedule: true,
                disputeId: dispute.disputeId
              }
            });

            // Emit socket notification
            if (global.chatGateway && typeof global.chatGateway.emitNotification === 'function') {
              global.chatGateway.emitNotification(newShipment.shipper.toString(), shipperNotification);
            }

            // Gửi email cho shipper
            const { sendShipperNotificationEmail } = require('../utils/mailer');
            try {
              await sendShipperNotificationEmail(
                shipperUser,
                newShipment,
                productData,
                {
                  name: renterData?.profile?.fullName || renterData?.profile?.firstName || 'Renter',
                  phone: renterData?.phone || '',
                  email: renterData?.email || ''
                },
                {
                  rentalStartDate: productItem?.rentalPeriod?.startDate 
                    ? new Date(productItem.rentalPeriod.startDate).toLocaleDateString('vi-VN')
                    : 'N/A',
                  rentalEndDate: productItem?.rentalPeriod?.endDate
                    ? new Date(productItem.rentalPeriod.endDate).toLocaleDateString('vi-VN')
                    : 'N/A',
                  notes: `Đơn trả hàng RESCHEDULE từ dispute ${dispute.disputeId}. Lý do: ${dispute.rescheduleRequest.reason || 'N/A'}`
                }
              );
              console.log('[Dispute Service] ✅ Shipper notification and email sent successfully');
            } catch (emailErr) {
              console.error('[Dispute Service] ⚠️ Failed to send shipper email:', emailErr.message);
            }
          }
        } catch (notifErr) {
          console.error('[Dispute Service] ⚠️ Failed to send shipper notification:', notifErr.message);
        }
      }

      return dispute.populate(['complainant', 'respondent']);

    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      throw error;
    }
  }

  /**
   * Finalize agreement từ negotiation room - Tạo shipment với ngày đã thỏa thuận
   * @param {String} disputeId - ID của dispute
   * @param {Date} agreedDate - Ngày đã thỏa thuận
   * @returns {Promise<Dispute>}
   */
  async finalizeRescheduleAgreement(disputeId, agreedDate) {
    const dispute = await Dispute.findOne(this._buildDisputeQuery(disputeId))
      .populate('complainant respondent subOrder');

    if (!dispute) {
      throw new Error('Dispute không tồn tại');
    }

    if (dispute.type !== 'RENTER_NO_RETURN') {
      throw new Error('Chỉ áp dụng cho dispute RENTER_NO_RETURN');
    }

    if (dispute.status !== 'IN_NEGOTIATION') {
      throw new Error('Dispute không ở trạng thái negotiation');
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    let newShipment = null;
    let penaltyAmount = 0;

    try {
      const Shipment = require('../models/Shipment');

      // Lấy thông tin cần thiết (tương tự như APPROVED case)
      const subOrder = await SubOrder.findById(dispute.subOrder._id)
        .populate('masterOrder')
        .populate('owner')
        .populate('products.product')
        .session(session);

      const masterOrder = subOrder.masterOrder;
      const renter = await User.findById(masterOrder.renter).session(session);
      const owner = subOrder.owner;

      const renterAddress = masterOrder.deliveryAddress || {};
      const ownerAddress = subOrder.ownerAddress || owner.addresses?.[0] || {};

      const productItem = subOrder.products[dispute.productIndex];
      const product = productItem.product;

      console.log('[Dispute Service] 📦 Creating negotiated shipment for product:', product?.name || 'Unknown');

      // Tạo shipment mới với ngày đã thỏa thuận
      newShipment = new Shipment({
        shipmentId: generateShipmentId(),
        subOrder: dispute.subOrder._id,
        productId: dispute.productId,
        productIndex: dispute.productIndex,
        shipper: null,
        type: 'RETURN',
        returnType: 'NORMAL',
        fromAddress: {
          streetAddress: renterAddress.streetAddress || '',
          ward: renterAddress.ward || '',
          district: renterAddress.district || '',
          city: renterAddress.city || '',
          province: renterAddress.province || '',
          coordinates: renterAddress.coordinates || {}
        },
        toAddress: {
          streetAddress: ownerAddress.streetAddress || '',
          ward: ownerAddress.ward || '',
          district: ownerAddress.district || '',
          city: ownerAddress.city || '',
          province: ownerAddress.province || '',
          coordinates: ownerAddress.coordinates || {}
        },
        contactInfo: {
          name: renterAddress.contactName || renter.profile?.fullName || 'Renter',
          phone: renterAddress.contactPhone || renter.phone || '',
          notes: `Ngày thỏa thuận từ negotiation - Dispute ${dispute.disputeId}`
        },
        customerInfo: {
          userId: renter._id,
          name: renter.profile?.fullName || renter.profile?.firstName || 'Renter',
          phone: renter.phone || '',
          email: renter.email || ''
        },
        fee: productItem.shipping?.fee?.totalFee || 0,
        scheduledAt: agreedDate,
        status: 'PENDING',
        tracking: {
          notes: `Lịch trả hàng từ negotiation room`
        }
      });
      await newShipment.save({ session });

      // Tạo ShipmentProof
      const ShipmentProof = require('../models/Shipment_Proof');
      const newShipmentProof = new ShipmentProof({
        shipment: newShipment._id,
        imageBeforeDelivery: '',
        imageAfterDelivery: '',
        notes: `RETURN (Negotiated): ${product?.name || 'Product'} | Date: ${agreedDate}`
      });
      await newShipmentProof.save({ session });

      // Assign shipper cũ
      const originalDeliveryShipment = await Shipment.findOne({
        subOrder: dispute.subOrder._id,
        productId: dispute.productId,
        type: 'DELIVERY'
      }).session(session).populate('shipper');

      if (originalDeliveryShipment?.shipper) {
        newShipment.shipper = originalDeliveryShipment.shipper._id || originalDeliveryShipment.shipper;
        await newShipment.save({ session });
      }

      // Cập nhật dispute
      dispute.negotiationRoom.finalAgreement = {
        proposedBy: dispute.respondent._id,
        proposalText: `Thỏa thuận trả hàng vào ngày ${new Date(agreedDate).toLocaleDateString('vi-VN')}`,
        complainantAccepted: true,
        respondentAccepted: true,
        acceptedAt: new Date()
      };

      // Phạt 10% deposit
      const depositAmount = productItem.totalDeposit || 0;
      penaltyAmount = depositAmount * 0.1;

      await SubOrder.findOneAndUpdate(
        { _id: dispute.subOrder._id, 'products.product': dispute.productId },
        { $set: { 'products.$.productStatus': 'RETURNING' } },
        { session }
      );

      dispute.status = 'RESOLVED';
      dispute.resolution = {
        resolvedBy: dispute.complainant._id,
        resolvedAt: new Date(),
        resolutionText: `2 bên thỏa thuận ngày trả: ${new Date(agreedDate).toLocaleDateString('vi-VN')}. Renter phạt 10% deposit (${penaltyAmount.toLocaleString('vi-VN')}đ)`,
        resolutionSource: 'NEGOTIATION',
        financialImpact: {
          penaltyAmount,
          compensationAmount: penaltyAmount,
          paidBy: dispute.respondent._id,
          paidTo: dispute.complainant._id,
          status: 'PENDING'
        }
      };

      // Xử lý tiền phạt
      const systemWallet = await SystemWallet.findOne({}).session(session);
      if (systemWallet && systemWallet.balance.available >= penaltyAmount) {
        systemWallet.balance.available -= penaltyAmount;
        await systemWallet.save({ session });

        const ownerWallet = await Wallet.findById(dispute.complainant.wallet).session(session);
        if (ownerWallet) {
          ownerWallet.balance.available += penaltyAmount;
          ownerWallet.balance.display = (ownerWallet.balance.available || 0) + (ownerWallet.balance.frozen || 0) + (ownerWallet.balance.pending || 0);
          await ownerWallet.save({ session });
        }

        dispute.resolution.financialImpact.status = 'COMPLETED';
      }

      // Trừ credit
      await User.findByIdAndUpdate(
        dispute.respondent._id,
        { $inc: { creditScore: -5 } },
        { session }
      );

      dispute.timeline.push({
        action: 'NEGOTIATION_AGREED',
        performedBy: dispute.complainant._id,
        details: `2 bên thỏa thuận ngày trả: ${new Date(agreedDate).toLocaleDateString('vi-VN')}. Tạo shipment mới. Phạt 10% deposit: ${penaltyAmount.toLocaleString('vi-VN')}đ. Credit -5.`,
        timestamp: new Date()
      });

      await dispute.save({ session });
      await session.commitTransaction();
      session.endSession();

      // Gửi notifications
      await this._createAndEmitNotification({
        recipient: dispute.respondent._id,
        type: 'DISPUTE',
        category: 'SUCCESS',
        title: 'Thỏa thuận thành công',
        message: `2 bên đã thỏa thuận ngày trả: ${new Date(agreedDate).toLocaleDateString('vi-VN')}. Shipment mới đã được tạo. Bạn bị phạt 10% deposit (${penaltyAmount.toLocaleString('vi-VN')}đ) và -5 credit score.`,
        relatedDispute: dispute._id,
        actions: [{
          label: 'Xem shipment',
          url: `/shipments/${newShipment._id}`,
          action: 'VIEW_SHIPMENT'
        }],
        status: 'SENT'
      });

      await this._createAndEmitNotification({
        recipient: dispute.complainant._id,
        type: 'DISPUTE',
        category: 'SUCCESS',
        title: 'Thỏa thuận thành công',
        message: `2 bên đã thỏa thuận ngày trả: ${new Date(agreedDate).toLocaleDateString('vi-VN')}. Shipment mới đã được tạo.`,
        relatedDispute: dispute._id,
        actions: [{
          label: 'Xem shipment',
          url: `/shipments/${newShipment._id}`,
          action: 'VIEW_SHIPMENT'
        }],
        status: 'SENT'
      });

      // Gửi notification/email cho shipper
      if (newShipment && newShipment.shipper) {
        try {
          const shipperUser = await User.findById(newShipment.shipper);
          if (shipperUser) {
            const populatedShipment = await newShipment.populate('subOrder');
            const subOrderData = await SubOrder.findById(populatedShipment.subOrder).populate('products.product masterOrder');
            const productItem = subOrderData.products[dispute.productIndex];
            const productData = productItem.product;
            const renterData = await User.findById(subOrderData.masterOrder.renter);
            const ownerData = await User.findById(subOrderData.owner);

            const shipperNotification = await notificationService.createNotification({
              recipient: newShipment.shipper,
              title: '📦 Đơn trả hàng mới (Negotiated)',
              message: `Bạn có đơn trả hàng mới: ${productData?.name || 'sản phẩm'} từ ${renterData?.profile?.fullName || 'Renter'} về ${ownerData?.profile?.fullName || 'Owner'}. Dự kiến: ${new Date(agreedDate).toLocaleDateString('vi-VN')}`,
              type: 'SHIPMENT',
              category: 'INFO',
              data: {
                shipmentId: newShipment.shipmentId,
                shipmentObjectId: newShipment._id,
                shipmentType: 'RETURN',
                productName: productData?.name || 'sản phẩm',
                scheduledAt: agreedDate,
                isNegotiated: true,
                disputeId: dispute.disputeId
              }
            });

            if (global.chatGateway && typeof global.chatGateway.emitNotification === 'function') {
              global.chatGateway.emitNotification(newShipment.shipper.toString(), shipperNotification);
            }

            const { sendShipperNotificationEmail } = require('../utils/mailer');
            try {
              await sendShipperNotificationEmail(
                shipperUser,
                newShipment,
                productData,
                {
                  name: renterData?.profile?.fullName || renterData?.profile?.firstName || 'Renter',
                  phone: renterData?.phone || '',
                  email: renterData?.email || ''
                },
                {
                  rentalStartDate: productItem?.rentalPeriod?.startDate 
                    ? new Date(productItem.rentalPeriod.startDate).toLocaleDateString('vi-VN')
                    : 'N/A',
                  rentalEndDate: productItem?.rentalPeriod?.endDate
                    ? new Date(productItem.rentalPeriod.endDate).toLocaleDateString('vi-VN')
                    : 'N/A',
                  notes: `Đơn trả hàng NEGOTIATED từ dispute ${dispute.disputeId}. Ngày thỏa thuận: ${new Date(agreedDate).toLocaleDateString('vi-VN')}`
                }
              );
              console.log('[Dispute Service] ✅ Shipper notification and email sent successfully');
            } catch (emailErr) {
              console.error('[Dispute Service] ⚠️ Failed to send shipper email:', emailErr.message);
            }
          }
        } catch (notifErr) {
          console.error('[Dispute Service] ⚠️ Failed to send shipper notification:', notifErr.message);
        }
      }

      return dispute.populate(['complainant', 'respondent']);

    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      throw error;
    }
  }

  /**
   * Escalate dispute RENTER_NO_RETURN lên công an sau 7 ngày
   * Áp dụng cho: Renter không phản hồi, không thương lượng, hoặc cố tình chiếm đoạt
   * @param {String} disputeId - ID của dispute
   * @returns {Promise<Dispute>}
   */
  async escalateToPolice(disputeId) {
    const dispute = await Dispute.findOne(this._buildDisputeQuery(disputeId))
      .populate('complainant respondent subOrder');

    if (!dispute) {
      throw new Error('Dispute không tồn tại');
    }

    if (dispute.type !== 'RENTER_NO_RETURN') {
      throw new Error('Chỉ áp dụng cho dispute RENTER_NO_RETURN');
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const productItem = dispute.subOrder.products[dispute.productIndex];
      const depositAmount = productItem.totalDeposit || 0;
      const productValue = productItem.totalRental || 0; // Hoặc giá trị sản phẩm thực tế

      // Phạt cực nặng: 100% deposit + 100% product value
      const totalPenalty = depositAmount + productValue;

      // Cập nhật dispute status
      dispute.status = 'THIRD_PARTY_ESCALATED';
      
      // Lưu thông tin escalate lên công an
      dispute.thirdPartyResolution = {
        escalatedAt: new Date(),
        escalatedBy: dispute.complainant._id,
        evidenceDeadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 ngày nữa
        thirdPartyInfo: {
          name: 'Cơ quan công an',
          contactInfo: 'Liên hệ công an địa phương',
          caseNumber: `THEFT-${dispute.disputeId}-${Date.now()}`
        }
      };

      // Cập nhật product status
      await SubOrder.findOneAndUpdate(
        { _id: dispute.subOrder._id, 'products.product': dispute.productId },
        { $set: { 'products.$.productStatus': 'THEFT_REPORTED' } },
        { session }
      );

      // Xử lý tiền phạt từ system wallet
      const systemWallet = await SystemWallet.findOne({}).session(session);
      if (systemWallet && systemWallet.balance.available >= totalPenalty) {
        systemWallet.balance.available -= totalPenalty;
        await systemWallet.save({ session });

        // Chuyển toàn bộ phạt cho owner
        const ownerWallet = await Wallet.findById(dispute.complainant.wallet).session(session);
        if (ownerWallet) {
          ownerWallet.balance.available += totalPenalty;
          ownerWallet.balance.display = (ownerWallet.balance.available || 0) + (ownerWallet.balance.frozen || 0) + (ownerWallet.balance.pending || 0);
          await ownerWallet.save({ session });
        }
      }

      // Permanent blacklist + Reset credit score về 0
      await User.findByIdAndUpdate(
        dispute.respondent._id,
        { 
          creditScore: 0,
          accountStatus: 'BLACKLISTED',
          blacklistUntil: new Date(9999, 11, 31), // Permanent
          blacklistReason: `Theft - Không trả hàng sau 7 ngày. Dispute: ${dispute.disputeId}`
        },
        { session }
      );

      dispute.resolution = {
        resolvedBy: 'SYSTEM',
        resolvedAt: new Date(),
        resolutionText: `Renter không phản hồi/thương lượng sau 7 ngày. Escalate lên công an. Phạt: ${totalPenalty.toLocaleString('vi-VN')}đ. Permanent blacklist + Credit reset về 0.`,
        resolutionSource: 'THIRD_PARTY',
        financialImpact: {
          penaltyAmount: totalPenalty,
          compensationAmount: totalPenalty,
          paidBy: dispute.respondent._id,
          paidTo: dispute.complainant._id,
          status: 'COMPLETED'
        }
      };

      dispute.timeline.push({
        action: 'ESCALATED_TO_POLICE',
        performedBy: 'SYSTEM',
        details: `Sau 7 ngày không phản hồi/thương lượng. Escalate lên công an. Phạt ${totalPenalty.toLocaleString('vi-VN')}đ. Permanent blacklist. Credit reset về 0.`,
        timestamp: new Date()
      });

      await dispute.save({ session });
      await session.commitTransaction();
      session.endSession();

      // Gửi notifications
      await this._createAndEmitNotification({
        recipient: dispute.complainant._id,
        type: 'DISPUTE',
        category: 'URGENT',
        title: '⚠️ Đã báo công an',
        message: `Renter không phản hồi sau 7 ngày. Hệ thống đã escalate vụ việc lên công an. Bạn nhận được bồi thường ${totalPenalty.toLocaleString('vi-VN')}đ.`,
        relatedDispute: dispute._id,
        actions: [{
          label: 'Xem chi tiết',
          url: `/disputes/${dispute._id}`,
          action: 'VIEW_DISPUTE'
        }],
        status: 'SENT'
      });

      await this._createAndEmitNotification({
        recipient: dispute.respondent._id,
        type: 'DISPUTE',
        category: 'URGENT',
        title: '🚨 Đã báo công an - Tài khoản bị khóa vĩnh viễn',
        message: `Bạn không phản hồi/thương lượng sau 7 ngày. Vụ việc đã được báo công an. Bạn bị phạt ${totalPenalty.toLocaleString('vi-VN')}đ, tài khoản bị khóa vĩnh viễn và credit reset về 0.`,
        relatedDispute: dispute._id,
        actions: [{
          label: 'Xem chi tiết',
          url: `/disputes/${dispute._id}`,
          action: 'VIEW_DISPUTE'
        }],
        status: 'SENT'
      });

      // Gửi email thông báo cho cả 2 bên
      // TODO: Implement email cho trường hợp escalate

      return dispute.populate(['complainant', 'respondent']);

    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      throw error;
    }
  }

  /**
   * Cron job: Tự động check các dispute RENTER_NO_RETURN quá 7 ngày chưa resolve
   * Chạy mỗi ngày để escalate lên công an
   */
  async checkAndEscalateExpiredDisputes() {
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      // Tìm các dispute RENTER_NO_RETURN:
      // - Status: OPEN (chưa phản hồi) hoặc IN_NEGOTIATION (đang thương lượng nhưng quá deadline)
      // - Created > 7 ngày trước
      const expiredDisputes = await Dispute.find({
        type: 'RENTER_NO_RETURN',
        status: { $in: ['OPEN', 'IN_NEGOTIATION'] },
        createdAt: { $lte: sevenDaysAgo }
      });

      console.log(`[Dispute Service] 🔍 Found ${expiredDisputes.length} expired RENTER_NO_RETURN disputes`);

      for (const dispute of expiredDisputes) {
        try {
          console.log(`[Dispute Service] ⚠️ Escalating dispute ${dispute.disputeId} to police`);
          await this.escalateToPolice(dispute._id);
          console.log(`[Dispute Service] ✅ Successfully escalated dispute ${dispute.disputeId}`);
        } catch (error) {
          console.error(`[Dispute Service] ❌ Failed to escalate dispute ${dispute.disputeId}:`, error.message);
        }
      }

      return {
        total: expiredDisputes.length,
        escalated: expiredDisputes.length
      };
    } catch (error) {
      console.error('[Dispute Service] ❌ Error in checkAndEscalateExpiredDisputes:', error);
      throw error;
    }
  }

  /**
   * Xử lý dispute RENTER_NO_RETURN khi không có reschedule hoặc reschedule bị từ chối
   * @param {String} disputeId - ID của dispute
   * @param {String} userId - ID của user (renter accept hoặc admin decide)
   * @param {Object} decisionData - { hasValidReason, isFirstOffense, hasResponse }
   * @returns {Promise<Dispute>}
   */
  async processRenterNoReturnPenalty(disputeId, userId, decisionData = {}) {
    const dispute = await Dispute.findOne(this._buildDisputeQuery(disputeId))
      .populate('complainant respondent subOrder');

    if (!dispute) {
      throw new Error('Dispute không tồn tại');
    }

    if (dispute.type !== 'RENTER_NO_RETURN') {
      throw new Error('Chỉ áp dụng cho dispute RENTER_NO_RETURN');
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const product = dispute.subOrder.products[dispute.productIndex];
      const depositAmount = product.totalDeposit || 0;
      const rentalAmount = product.totalRental || 0;

      // Lấy thông tin renter để check credit score và offense history
      const renter = await User.findById(dispute.respondent._id).session(session);
      const creditScore = renter.creditScore || 50;

      // Check nếu là first offense
      const previousDisputes = await Dispute.countDocuments({
        respondent: renter._id,
        type: 'RENTER_NO_RETURN',
        status: 'RESOLVED',
        _id: { $ne: dispute._id }
      });
      const isFirstOffense = previousDisputes === 0;

      // Calculate penalty using model method
      const penalty = dispute.calculateRenterNoReturnPenalty({
        depositAmount,
        rentalAmount,
        creditScore,
        hasValidReason: decisionData.hasValidReason || false,
        isFirstOffense,
        hasResponse: decisionData.hasResponse !== false // Default true
      });

      // Xử lý tiền
      const renterWallet = await Wallet.findById(renter.wallet).session(session);
      const ownerWallet = await Wallet.findById(dispute.complainant.wallet).session(session);
      const systemWallet = await SystemWallet.findOne({}).session(session);

      if (!systemWallet) {
        throw new Error('Không tìm thấy system wallet');
      }

      // 1. Giữ deposit theo penalty percent
      const depositToKeep = penalty.keepDeposit;
      
      if (systemWallet.balance.available >= depositToKeep) {
        systemWallet.balance.available -= depositToKeep;
        await systemWallet.save({ session });

        // Chuyển cho owner
        if (ownerWallet) {
          ownerWallet.balance.available += depositToKeep;
          ownerWallet.balance.display = (ownerWallet.balance.available || 0) + (ownerWallet.balance.frozen || 0) + (ownerWallet.balance.pending || 0);
          await ownerWallet.save({ session });
        }
      }

      // 2. Trừ additional penalty từ ví renter (nếu có)
      let additionalPaid = 0;
      if (penalty.additionalPenalty > 0 && renterWallet) {
        const availableBalance = renterWallet.balance.available || 0;
        additionalPaid = Math.min(penalty.additionalPenalty, availableBalance);
        
        if (additionalPaid > 0) {
          renterWallet.balance.available -= additionalPaid;
          renterWallet.balance.display = (renterWallet.balance.available || 0) + (renterWallet.balance.frozen || 0) + (renterWallet.balance.pending || 0);
          await renterWallet.save({ session });

          // Chuyển cho owner
          if (ownerWallet) {
            ownerWallet.balance.available += additionalPaid;
            ownerWallet.balance.display = (ownerWallet.balance.available || 0) + (ownerWallet.balance.frozen || 0) + (ownerWallet.balance.pending || 0);
            await ownerWallet.save({ session });
          }
        }
      }

      // 3. Hoàn deposit còn lại cho renter (nếu có)
      const remainingDeposit = depositAmount - depositToKeep;
      if (remainingDeposit > 0 && renterWallet && systemWallet.balance.available >= remainingDeposit) {
        systemWallet.balance.available -= remainingDeposit;
        await systemWallet.save({ session });

        renterWallet.balance.available += remainingDeposit;
        renterWallet.balance.display = (renterWallet.balance.available || 0) + (renterWallet.balance.frozen || 0) + (renterWallet.balance.pending || 0);
        await renterWallet.save({ session });
      }

      // 4. Cập nhật credit score
      await User.findByIdAndUpdate(
        renter._id,
        { $inc: { creditScore: penalty.creditPenalty } },
        { session }
      );

      // 5. Blacklist nếu cần
      if (penalty.shouldBlacklist) {
        const blacklistUntil = new Date();
        blacklistUntil.setDate(blacklistUntil.getDate() + (penalty.blacklistDays || 30));
        
        await User.findByIdAndUpdate(
          renter._id,
          { 
            isBlacklisted: true,
            blacklistUntil,
            blacklistReason: 'Không trả hàng khi shipper đến lấy'
          },
          { session }
        );
      }

      // 6. Cập nhật dispute
      dispute.status = 'RESOLVED';
      dispute.resolution = {
        resolvedBy: userId,
        resolvedAt: new Date(),
        resolutionText: penalty.message,
        resolutionSource: 'RENTER_NO_RETURN_PENALTY',
        financialImpact: {
          refundAmount: remainingDeposit,
          penaltyAmount: depositToKeep + additionalPaid,
          compensationAmount: depositToKeep + additionalPaid,
          paidBy: renter._id,
          paidTo: dispute.complainant._id,
          status: 'COMPLETED',
          notes: `Giữ ${penalty.penaltyPercent}% deposit (${depositToKeep.toLocaleString('vi-VN')}đ)` +
                 (additionalPaid > 0 ? ` + Phạt thêm ${additionalPaid.toLocaleString('vi-VN')}đ từ ví` : '') +
                 (remainingDeposit > 0 ? `. Hoàn ${remainingDeposit.toLocaleString('vi-VN')}đ cho renter` : '')
        }
      };

      dispute.timeline.push({
        action: 'RENTER_NO_RETURN_RESOLVED',
        performedBy: userId,
        details: `${penalty.message}. Phạt: ${(depositToKeep + additionalPaid).toLocaleString('vi-VN')}đ. Credit: ${penalty.creditPenalty}.${penalty.shouldBlacklist ? ' Blacklist ' + (penalty.blacklistDays || 30) + ' ngày.' : ''}`,
        timestamp: new Date()
      });

      await dispute.save({ session });
      await session.commitTransaction();
      session.endSession();

      // Notifications
      try {
        await this._createAndEmitNotification({
          recipient: renter._id,
          type: 'DISPUTE',
          category: 'WARNING',
          title: 'Dispute đã được xử lý',
          message: `Bạn bị phạt ${(depositToKeep + additionalPaid).toLocaleString('vi-VN')}đ và ${penalty.creditPenalty} credit score do không trả hàng.${penalty.shouldBlacklist ? ' Tài khoản bị tạm khóa ' + (penalty.blacklistDays || 30) + ' ngày.' : ''}`,
          relatedDispute: dispute._id,
          status: 'SENT'
        });

        await this._createAndEmitNotification({
          recipient: dispute.complainant._id,
          type: 'DISPUTE',
          category: 'SUCCESS',
          title: 'Dispute đã được giải quyết',
          message: `Bạn nhận được ${(depositToKeep + additionalPaid).toLocaleString('vi-VN')}đ tiền phạt từ renter không trả hàng.`,
          relatedDispute: dispute._id,
          status: 'SENT'
        });
      } catch (notifError) {
        console.error('Failed to send penalty notifications:', notifError);
      }

      return dispute.populate(['complainant', 'respondent']);

    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      throw error;
    }
  }

}

module.exports = new DisputeService();
