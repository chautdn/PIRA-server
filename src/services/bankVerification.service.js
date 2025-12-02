const User = require('../models/User');

class BankVerificationService {
  /**
   * Get all bank accounts with filters
   */
  async getAllBankAccounts(filters = {}) {
    try {
      const {
        page = 1,
        limit = 10,
        search,
        status,
        bankCode
      } = filters;

      const skip = (page - 1) * limit;
      const query = {
        'bankAccount.accountNumber': { $exists: true, $ne: null }
      };

      // Filter by verification status
      if (status) {
        query['bankAccount.status'] = status.toUpperCase();
      }

      // Filter by bank code
      if (bankCode) {
        query['bankAccount.bankCode'] = bankCode.toUpperCase();
      }

      // Search by account number, account holder name, or user email
      if (search) {
        query.$or = [
          { 'bankAccount.accountNumber': { $regex: search, $options: 'i' } },
          { 'bankAccount.accountHolderName': { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } }
        ];
      }

      // Get bank accounts with pagination
      const [bankAccounts, total] = await Promise.all([
        User.find(query)
          .select('email profile.firstName profile.lastName bankAccount role status')
          .skip(skip)
          .limit(parseInt(limit))
          .sort({ 'bankAccount.addedAt': -1 })
          .lean(),
        User.countDocuments(query)
      ]);

      // Get statistics
      const stats = await User.aggregate([
        {
          $match: {
            'bankAccount.accountNumber': { $exists: true, $ne: null }
          }
        },
        {
          $facet: {
            statusStats: [
              {
                $group: {
                  _id: '$bankAccount.status',
                  count: { $sum: 1 }
                }
              }
            ],
            total: [
              {
                $count: 'count'
              }
            ]
          }
        }
      ]);

      const statusCounts = {};
      if (stats[0]?.statusStats) {
        stats[0].statusStats.forEach(stat => {
          statusCounts[stat._id?.toLowerCase() || 'pending'] = stat.count;
        });
      }

      return {
        bankAccounts,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalBankAccounts: total,
          limit: parseInt(limit)
        },
        stats: {
          total: stats[0]?.total[0]?.count || 0,
          pending: statusCounts.pending || 0,
          verified: statusCounts.verified || 0,
          rejected: statusCounts.rejected || 0
        }
      };
    } catch (error) {
      throw new Error(`Lỗi khi lấy danh sách tài khoản ngân hàng: ${error.message}`);
    }
  }

  /**
   * Get bank account detail by user ID
   */
  async getBankAccountById(userId) {
    try {
      const user = await User.findById(userId)
        .select('email profile bankAccount role status verification cccd')
        .lean();

      if (!user) {
        throw new Error('Không tìm thấy người dùng');
      }

      if (!user.bankAccount || !user.bankAccount.accountNumber) {
        throw new Error('Người dùng chưa có tài khoản ngân hàng');
      }

      return user;
    } catch (error) {
      throw new Error(`Lỗi khi lấy chi tiết tài khoản ngân hàng: ${error.message}`);
    }
  }

  /**
   * Verify bank account
   */
  async verifyBankAccount(userId, adminNote = '') {
    try {
      console.log('verifyBankAccount service called with:', { userId, adminNote });
      
      const user = await User.findById(userId);
      console.log('User found:', user ? 'Yes' : 'No');

      if (!user) {
        throw new Error('Không tìm thấy người dùng');
      }

      console.log('User bankAccount:', user.bankAccount);

      if (!user.bankAccount || !user.bankAccount.accountNumber) {
        throw new Error('Người dùng chưa có tài khoản ngân hàng');
      }

      if (user.bankAccount.status === 'VERIFIED') {
        throw new Error('Tài khoản ngân hàng đã được xác minh');
      }

      // Update bank account status
      user.bankAccount.status = 'VERIFIED';
      user.bankAccount.isVerified = true;
      user.bankAccount.verifiedAt = new Date();
      user.bankAccount.adminNote = adminNote;

      // Clean invalid gender value if exists
      if (user.profile && user.profile.gender && !['MALE', 'FEMALE', 'OTHER'].includes(user.profile.gender)) {
        console.log('Cleaning invalid gender value:', user.profile.gender);
        user.profile.gender = undefined;
      }

      console.log('Saving user with updated bank account...');
      await user.save();
      console.log('User saved successfully');

      return user;
    } catch (error) {
      console.error('Error in verifyBankAccount service:', error);
      throw new Error(`Lỗi khi xác minh tài khoản ngân hàng: ${error.message}`);
    }
  }

  /**
   * Reject bank account verification
   */
  async rejectBankAccount(userId, rejectionReason) {
    try {
      const user = await User.findById(userId);

      if (!user) {
        throw new Error('Không tìm thấy người dùng');
      }

      if (!user.bankAccount || !user.bankAccount.accountNumber) {
        throw new Error('Người dùng chưa có tài khoản ngân hàng');
      }

      if (user.bankAccount.status === 'REJECTED') {
        throw new Error('Tài khoản ngân hàng đã bị từ chối');
      }

      // Update bank account status
      user.bankAccount.status = 'REJECTED';
      user.bankAccount.isVerified = false;
      user.bankAccount.rejectionReason = rejectionReason;
      user.bankAccount.rejectedAt = new Date();

      // Clean invalid gender value if exists
      if (user.profile && user.profile.gender && !['MALE', 'FEMALE', 'OTHER'].includes(user.profile.gender)) {
        user.profile.gender = undefined;
      }

      await user.save();

      return user;
    } catch (error) {
      throw new Error(`Lỗi khi từ chối xác minh tài khoản ngân hàng: ${error.message}`);
    }
  }

  /**
   * Update bank account status
   */
  async updateBankAccountStatus(userId, status, note = '') {
    try {
      const user = await User.findById(userId);

      if (!user) {
        throw new Error('Không tìm thấy người dùng');
      }

      if (!user.bankAccount || !user.bankAccount.accountNumber) {
        throw new Error('Người dùng chưa có tài khoản ngân hàng');
      }

      const validStatuses = ['PENDING', 'VERIFIED', 'REJECTED'];
      if (!validStatuses.includes(status.toUpperCase())) {
        throw new Error('Trạng thái không hợp lệ');
      }

      // Update bank account status
      user.bankAccount.status = status.toUpperCase();
      user.bankAccount.isVerified = status.toUpperCase() === 'VERIFIED';
      
      if (status.toUpperCase() === 'VERIFIED') {
        user.bankAccount.verifiedAt = new Date();
        user.bankAccount.adminNote = note;
      } else if (status.toUpperCase() === 'REJECTED') {
        user.bankAccount.rejectedAt = new Date();
        user.bankAccount.rejectionReason = note;
      }

      // Clean invalid gender value if exists
      if (user.profile && user.profile.gender && !['MALE', 'FEMALE', 'OTHER'].includes(user.profile.gender)) {
        user.profile.gender = undefined;
      }

      await user.save();

      return user;
    } catch (error) {
      throw new Error(`Lỗi khi cập nhật trạng thái tài khoản ngân hàng: ${error.message}`);
    }
  }
}

module.exports = new BankVerificationService();
