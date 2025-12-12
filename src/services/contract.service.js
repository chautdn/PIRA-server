const Contract = require('../models/Contract');
const SubOrder = require('../models/SubOrder');
const User = require('../models/User');
const contractOtpService = require('./contractOtp.service');

/**
 * Service riêng cho Contract OTP Signing Flow
 * Flow: Owner confirm → edit contract → ký với OTP → gửi Renter → Renter ký/từ chối
 */
class ContractService {
  /**
   * 1. Owner edit contract (DRAFT → OWNER_EDITING)
   */
  async ownerEditContract(contractId, ownerId, customContent) {
    const contract = await Contract.findById(contractId).populate('owner renter');

    if (!contract) {
      throw new Error('Không tìm thấy hợp đồng');
    }

    // Verify owner
    if (contract.owner._id.toString() !== ownerId.toString()) {
      throw new Error('Bạn không có quyền chỉnh sửa hợp đồng này');
    }

    // Check status
    if (!['DRAFT', 'OWNER_EDITING'].includes(contract.status)) {
      throw new Error('Hợp đồng không thể chỉnh sửa ở trạng thái hiện tại');
    }

    // Update custom content
    contract.customContent = customContent;
    contract.status = 'OWNER_EDITING';
    await contract.save();

    return contract;
  }

  /**
   * 2. Owner request OTP for signing
   */
  async ownerRequestSignOTP(contractId, ownerId) {
    const contract = await Contract.findById(contractId).populate('owner');

    if (!contract) {
      throw new Error('Không tìm thấy hợp đồng');
    }

    // Verify owner
    if (contract.owner._id.toString() !== ownerId.toString()) {
      throw new Error('Bạn không có quyền ký hợp đồng này');
    }

    // Check status
    if (!['DRAFT', 'OWNER_EDITING'].includes(contract.status)) {
      throw new Error('Hợp đồng không thể ký ở trạng thái hiện tại');
    }

    // Check if already signed
    if (contract.signatures.owner.signed) {
      throw new Error('Bạn đã ký hợp đồng này rồi');
    }

    // Generate and send OTP
    const otp = contractOtpService.generateOTP();
    const otpKey = `contract_owner_${contractId}_${ownerId}`;
    contractOtpService.storeOTP(otpKey, otp);

    await contractOtpService.sendContractSigningOTP(
      contract.owner.email,
      otp,
      'owner',
      contract.contractNumber
    );

    return {
      message: 'Mã OTP đã được gửi đến email của bạn',
      email: contract.owner.email,
      expiresIn: '5 phút'
    };
  }

  /**
   * 3. Owner sign contract with OTP (OWNER_EDITING → OWNER_SIGNED → gửi cho Renter)
   */
  async ownerSignContract(contractId, ownerId, otpCode, ipAddress) {
    const contract = await Contract.findById(contractId).populate('owner renter');

    if (!contract) {
      throw new Error('Không tìm thấy hợp đồng');
    }

    // Verify owner
    if (contract.owner._id.toString() !== ownerId.toString()) {
      throw new Error('Bạn không có quyền ký hợp đồng này');
    }

    // Check status
    if (!['DRAFT', 'OWNER_EDITING'].includes(contract.status)) {
      throw new Error('Hợp đồng không thể ký ở trạng thái hiện tại');
    }

    // Check if already signed
    if (contract.signatures.owner.signed) {
      throw new Error('Bạn đã ký hợp đồng này rồi');
    }

    // Verify OTP
    const otpKey = `contract_owner_${contractId}_${ownerId}`;
    try {
      contractOtpService.verifyOTP(otpKey, otpCode);
    } catch (error) {
      throw new Error(error.message);
    }

    // Sign contract
    const crypto = require('crypto');
    const signatureData = `OWNER_${ownerId}_${contractId}_${Date.now()}`;
    const signatureHash = crypto.createHash('sha256').update(signatureData).digest('hex');

    contract.signatures.owner = {
      signed: true,
      signedAt: new Date(),
      ipAddress,
      signature: signatureHash,
      signatureHash
    };

    contract.status = 'OWNER_SIGNED';

    // Set response deadline for renter (48 hours)
    contract.responseDeadline = new Date(Date.now() + 48 * 60 * 60 * 1000);

    await contract.save();

    // Send notification to renter
    await contractOtpService.sendContractReadyNotification(
      contract.renter.email,
      contract.contractNumber,
      contract.owner.profile?.fullName || 'Chủ đồ',
      contract.responseDeadline
    );

    return contract;
  }

  /**
   * 4. Renter request OTP for signing
   */
  async renterRequestSignOTP(contractId, renterId) {
    const contract = await Contract.findById(contractId).populate('renter');

    if (!contract) {
      throw new Error('Không tìm thấy hợp đồng');
    }

    // Verify renter
    if (contract.renter._id.toString() !== renterId.toString()) {
      throw new Error('Bạn không có quyền ký hợp đồng này');
    }

    // Check status
    if (contract.status !== 'OWNER_SIGNED') {
      throw new Error('Chủ đồ chưa ký hợp đồng');
    }

    // Check if already signed
    if (contract.signatures.renter.signed) {
      throw new Error('Bạn đã ký hợp đồng này rồi');
    }

    // Check deadline
    if (new Date() > contract.responseDeadline) {
      contract.status = 'EXPIRED';
      await contract.save();
      throw new Error('Hợp đồng đã quá hạn ký');
    }

    // Generate and send OTP
    const otp = contractOtpService.generateOTP();
    const otpKey = `contract_renter_${contractId}_${renterId}`;
    contractOtpService.storeOTP(otpKey, otp);

    await contractOtpService.sendContractSigningOTP(
      contract.renter.email,
      otp,
      'renter',
      contract.contractNumber
    );

    return {
      message: 'Mã OTP đã được gửi đến email của bạn',
      email: contract.renter.email,
      expiresIn: '5 phút'
    };
  }

  /**
   * 5. Renter sign contract with OTP (OWNER_SIGNED → SIGNED)
   */
  async renterSignContract(contractId, renterId, otpCode, ipAddress) {
    const contract = await Contract.findById(contractId).populate('renter subOrder');

    if (!contract) {
      throw new Error('Không tìm thấy hợp đồng');
    }

    // Verify renter
    if (contract.renter._id.toString() !== renterId.toString()) {
      throw new Error('Bạn không có quyền ký hợp đồng này');
    }

    // Check status
    if (contract.status !== 'OWNER_SIGNED') {
      throw new Error('Hợp đồng chưa sẵn sàng để ký');
    }

    // Check if already signed
    if (contract.signatures.renter.signed) {
      throw new Error('Bạn đã ký hợp đồng này rồi');
    }

    // Check deadline
    if (new Date() > contract.responseDeadline) {
      contract.status = 'EXPIRED';
      await contract.save();
      throw new Error('Hợp đồng đã quá hạn ký');
    }

    // Verify OTP
    const otpKey = `contract_renter_${contractId}_${renterId}`;
    try {
      contractOtpService.verifyOTP(otpKey, otpCode);
    } catch (error) {
      throw new Error(error.message);
    }

    // Sign contract
    const crypto = require('crypto');
    const signatureData = `RENTER_${renterId}_${contractId}_${Date.now()}`;
    const signatureHash = crypto.createHash('sha256').update(signatureData).digest('hex');

    contract.signatures.renter = {
      signed: true,
      signedAt: new Date(),
      ipAddress,
      signature: signatureHash,
      signatureHash
    };

    contract.status = 'SIGNED';
    contract.isActive = true;

    // Generate contract hash for verification
    const contractData = {
      contractNumber: contract.contractNumber,
      terms: contract.terms,
      customContent: contract.customContent,
      signatures: contract.signatures
    };
    contract.verification.contractHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(contractData))
      .digest('hex');
    contract.verification.timestamp = new Date();

    await contract.save();

    // Update SubOrder status
    if (contract.subOrder) {
      const subOrder = await SubOrder.findById(contract.subOrder._id);
      subOrder.status = 'CONTRACT_SIGNED';
      await subOrder.save();

      // ✅ Process refund for rejected products if renterDecision indicates partial acceptance
      const hasRenterDecision = !!subOrder.renterDecision;
      const isAccepted = subOrder.renterDecision?.status === 'ACCEPTED';
      const isContinuePartial = subOrder.renterDecision?.choice === 'CONTINUE_PARTIAL';
      const notYetProcessed = !subOrder.renterDecision?.refundProcessed;
      const hasRejectedProducts = subOrder.products?.some((p) => p.productStatus === 'REJECTED');
      const shouldProcessRefund =
        (hasRenterDecision && isAccepted && isContinuePartial && notYetProcessed) ||
        (!hasRenterDecision && hasRejectedProducts && subOrder.ownerDecision?.status === 'PARTIAL');

      if (shouldProcessRefund) {
        let refundDetails = subOrder.renterDecision?.refundDetails || {};

        // ✅ FALLBACK: Calculate refund from products if not in renterDecision
        if (!refundDetails.totalRefund || refundDetails.totalRefund === 0) {
          let depositRefund = 0;
          let rentalRefund = 0;
          let shippingRefund = 0;
          const confirmedProductIds = [];

          // Calculate from products
          for (const productItem of subOrder.products) {
            if (productItem.productStatus === 'REJECTED') {
              depositRefund += productItem.totalDeposit || 0;
              rentalRefund += productItem.totalRental || 0;
            } else if (productItem.productStatus === 'CONFIRMED') {
              confirmedProductIds.push(productItem._id);
            }
          }

          // Calculate shipping from deliveryBatches
          if (subOrder.deliveryBatches && subOrder.deliveryBatches.length > 0) {
            subOrder.deliveryBatches.forEach((batch) => {
              const hasConfirmed = batch.products.some((batchProductId) =>
                confirmedProductIds.some((pid) => pid.toString() === batchProductId.toString())
              );

              if (!hasConfirmed) {
                shippingRefund += batch.shippingFee.finalFee || 0;
              }
            });
          }

          refundDetails = {
            depositRefund,
            rentalRefund,
            shippingRefund,
            totalRefund: depositRefund + rentalRefund + shippingRefund
          };
        }

        const totalRefund =
          (refundDetails.depositRefund || 0) +
          (refundDetails.rentalRefund || 0) +
          (refundDetails.shippingRefund || 0);

        if (totalRefund > 0) {
          console.log(
            `💰 Processing deferred refund after renter signed contract: ${totalRefund.toLocaleString('vi-VN')}đ`
          );

          const Wallet = require('../models/Wallet');
          const Transaction = require('../models/Transaction');
          const SystemWallet = require('../models/SystemWallet');

          const renterId = contract.renter._id;

          // Get wallet
          const wallet = await Wallet.findOne({ user: renterId });
          if (wallet) {
            // Add refund to wallet
            wallet.balance.available += totalRefund;
            await wallet.save();

            // Deduct from system wallet
            const systemWallet = await SystemWallet.findOne({});
            if (systemWallet && systemWallet.balance.available >= totalRefund) {
              systemWallet.balance.available -= totalRefund;
              await systemWallet.save();
            }

            // Create transaction record
            const transaction = new Transaction({
              user: renterId,
              wallet: wallet._id,
              type: 'refund',
              amount: totalRefund,
              status: 'success',
              description: `Hoàn tiền phần bị từ chối - Đơn ${subOrder.subOrderNumber} (sau khi ký hợp đồng)`,
              reference: subOrder.subOrderNumber,
              paymentMethod: 'wallet',
              fromSystemWallet: true,
              systemWalletAction: 'refund',
              metadata: {
                subOrderId: subOrder._id,
                contractId: contract._id,
                refundType: 'partial_rejection_after_contract',
                refundBreakdown: {
                  depositRefund: refundDetails.depositRefund || 0,
                  rentalRefund: refundDetails.rentalRefund || 0,
                  shippingRefund: refundDetails.shippingRefund || 0
                }
              },
              processedAt: new Date()
            });
            await transaction.save();

            // Update renterDecision to mark refund as processed
            if (subOrder.renterDecision) {
              subOrder.renterDecision.refundProcessed = true;
              if (subOrder.renterDecision.refundDetails) {
                subOrder.renterDecision.refundDetails.processedAt = new Date();
              }
            } else {
              // Create renterDecision if not exists (fallback case)
              subOrder.renterDecision = {
                status: 'ACCEPTED',
                decidedAt: new Date(),
                choice: 'CONTINUE_PARTIAL',
                refundProcessed: true,
                refundDetails: {
                  ...refundDetails,
                  processedAt: new Date()
                }
              };
            }
            await subOrder.save();

            console.log(
              `✅ Refunded ${totalRefund.toLocaleString('vi-VN')}đ after contract signing`
            );
          } else {
            console.error(`❌ Wallet not found for renter ${renterId}`);
          }
        } else {
          console.log(`⚠️ No refund needed (totalRefund = 0)`);
        }
      }
    }

    return contract;
  }

  /**
   * 6. Renter reject contract (OWNER_SIGNED → RENTER_REJECTED)
   */
  async renterRejectContract(contractId, renterId, reason) {
    const contract = await Contract.findById(contractId).populate('renter subOrder');

    if (!contract) {
      throw new Error('Không tìm thấy hợp đồng');
    }

    // Verify renter
    if (contract.renter._id.toString() !== renterId.toString()) {
      throw new Error('Bạn không có quyền từ chối hợp đồng này');
    }

    // Check status
    if (contract.status !== 'OWNER_SIGNED') {
      throw new Error('Hợp đồng không thể từ chối ở trạng thái hiện tại');
    }

    // Reject contract
    contract.status = 'RENTER_REJECTED';
    contract.notes = reason || 'Người thuê từ chối hợp đồng';
    await contract.save();

    // Update SubOrder status
    if (contract.subOrder) {
      await SubOrder.findByIdAndUpdate(contract.subOrder._id, {
        status: 'CONTRACT_REJECTED'
      });
    }

    return contract;
  }

  /**
   * Check for expired contracts (cron job)
   */
  async checkExpiredContracts() {
    const expiredContracts = await Contract.find({
      status: 'OWNER_SIGNED',
      responseDeadline: { $lt: new Date() }
    });

    for (const contract of expiredContracts) {
      contract.status = 'EXPIRED';
      await contract.save();

      // Update SubOrder if exists
      if (contract.subOrder) {
        await SubOrder.findByIdAndUpdate(contract.subOrder, {
          status: 'CONTRACT_EXPIRED'
        });
      }
    }

    return expiredContracts.length;
  }

  /**
   * Get contract details with user role
   */
  async getContractWithUserRole(contractId, userId) {
    const contract = await Contract.findById(contractId)
      .populate('owner', 'profile email')
      .populate('renter', 'profile email')
      .populate('product', 'title images')
      .populate('subOrder')
      .populate('masterOrder');

    if (!contract) {
      throw new Error('Không tìm thấy hợp đồng');
    }

    // Determine user role
    let userRole = null;
    let canSign = false;
    let signMessage = '';

    if (contract.owner._id.toString() === userId.toString()) {
      userRole = 'owner';

      if (
        !contract.signatures.owner.signed &&
        ['DRAFT', 'OWNER_EDITING'].includes(contract.status)
      ) {
        canSign = true;
        signMessage = 'Bạn có thể chỉnh sửa và ký hợp đồng';
      } else if (contract.signatures.owner.signed) {
        signMessage = 'Bạn đã ký hợp đồng. Chờ người thuê ký.';
      }
    } else if (contract.renter._id.toString() === userId.toString()) {
      userRole = 'renter';

      if (contract.status === 'OWNER_SIGNED' && !contract.signatures.renter.signed) {
        if (new Date() > contract.responseDeadline) {
          signMessage = 'Hợp đồng đã quá hạn ký';
        } else {
          canSign = true;
          const hoursLeft = Math.ceil((contract.responseDeadline - new Date()) / (1000 * 60 * 60));
          signMessage = `Bạn có ${hoursLeft} giờ để ký hoặc từ chối hợp đồng`;
        }
      } else if (contract.signatures.renter.signed) {
        signMessage = 'Bạn đã ký hợp đồng';
      } else {
        signMessage = 'Chờ chủ đồ ký hợp đồng trước';
      }
    }

    return {
      contract,
      userRole,
      canSign,
      signMessage
    };
  }
}

module.exports = new ContractService();
