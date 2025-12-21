/**
 * Dispute Socket Handler
 * Manages real-time dispute updates between renters, owners, and admins
 */

// Track user socket connections
const userSockets = new Map();

const initDisputeSocket = (io) => {
  const disputeNamespace = io.of('/');

  disputeNamespace.on('connection', (socket) => {
    // Dispute socket connected

    // Register user for dispute updates
    socket.on('dispute:register', (userId) => {
      if (!userId) return;

      const userIdStr = userId.toString();
      socket.join(`user:${userIdStr}`);
      userSockets.set(socket.id, userIdStr);

      // Log all rooms this socket is in
      const rooms = Array.from(socket.rooms);
      // User registered for dispute updates
    });

    // When dispute is created - notify respondent
    socket.on('dispute:created', (data) => {
      const { respondentId, disputeId, creatorName, orderId, reason, createdAt } = data;

      if (respondentId) {
        io.to(`user:${respondentId}`).emit('dispute:new', {
          disputeId,
          creatorName,
          orderId,
          reason,
          createdAt,
          message: `${creatorName} đã tạo khiếu nại cho đơn hàng của bạn`
        });
      }
    });

    // When dispute status changes - notify both parties
    socket.on('dispute:statusUpdate', (data) => {
      const { disputeId, renterId, ownerId, status, previousStatus, updatedBy, message } = data;

      const payload = {
        disputeId,
        status,
        previousStatus,
        updatedBy,
        message,
        timestamp: new Date()
      };

      // Notify both parties
      if (renterId) {
        io.to(`user:${renterId}`).emit('dispute:statusChanged', payload);
      }
      if (ownerId) {
        io.to(`user:${ownerId}`).emit('dispute:statusChanged', payload);
      }
    });

    // When respondent submits response (accept/reject)
    socket.on('dispute:responseSubmitted', (data) => {
      const { disputeId, creatorId, respondentId, response, respondentName } = data;

      const payload = {
        disputeId,
        response, // 'ACCEPTED' or 'REJECTED'
        respondentName,
        timestamp: new Date(),
        message:
          response === 'ACCEPTED'
            ? `${respondentName} đã chấp nhận khiếu nại`
            : `${respondentName} đã từ chối khiếu nại`
      };

      // Notify dispute creator
      if (creatorId) {
        io.to(`user:${creatorId}`).emit('dispute:responseReceived', payload);
      }
    });

    // When negotiation message is sent
    socket.on('dispute:negotiationMessage', (data) => {
      const {
        disputeId,
        renterId,
        ownerId,
        senderId,
        senderName,
        message: msgContent,
        type
      } = data;

      const payload = {
        disputeId,
        senderId,
        senderName,
        message: msgContent,
        type, // 'MESSAGE', 'OFFER', 'COUNTER_OFFER'
        timestamp: new Date()
      };

      // Notify the other party
      if (renterId && senderId !== renterId) {
        io.to(`user:${renterId}`).emit('dispute:negotiationUpdate', payload);
      }
      if (ownerId && senderId !== ownerId) {
        io.to(`user:${ownerId}`).emit('dispute:negotiationUpdate', payload);
      }
    });

    // When negotiation offer is accepted/rejected
    socket.on('dispute:negotiationResponse', (data) => {
      const { disputeId, renterId, ownerId, responderId, responderName, offerResponse, newStatus } =
        data;

      const payload = {
        disputeId,
        responderId,
        responderName,
        response: offerResponse, // 'ACCEPTED' or 'REJECTED'
        newStatus,
        timestamp: new Date(),
        message:
          offerResponse === 'ACCEPTED'
            ? `${responderName} đã đồng ý với đề xuất thương lượng`
            : `${responderName} đã từ chối đề xuất thương lượng`
      };

      // Notify both parties
      if (renterId) {
        io.to(`user:${renterId}`).emit('dispute:negotiationResult', payload);
      }
      if (ownerId) {
        io.to(`user:${ownerId}`).emit('dispute:negotiationResult', payload);
      }
    });

    // When dispute is escalated to third party or admin
    socket.on('dispute:escalated', (data) => {
      const { disputeId, renterId, ownerId, escalatedTo, escalatedBy } = data;

      const payload = {
        disputeId,
        escalatedTo, // 'THIRD_PARTY' or 'ADMIN'
        escalatedBy,
        timestamp: new Date(),
        message:
          escalatedTo === 'THIRD_PARTY'
            ? 'Khiếu nại đã được chuyển đến bên thứ ba để xác minh'
            : 'Khiếu nại đã được chuyển đến Admin để quyết định'
      };

      // Notify both parties
      if (renterId) {
        io.to(`user:${renterId}`).emit('dispute:escalatedNotification', payload);
      }
      if (ownerId) {
        io.to(`user:${ownerId}`).emit('dispute:escalatedNotification', payload);
      }
    });

    // When third party uploads evidence
    socket.on('dispute:evidenceUploaded', (data) => {
      const { disputeId, renterId, ownerId, uploaderName, evidenceType } = data;

      const payload = {
        disputeId,
        uploaderName,
        evidenceType,
        timestamp: new Date(),
        message: `${uploaderName} đã cung cấp bằng chứng cho khiếu nại`
      };

      // Notify both parties
      if (renterId) {
        io.to(`user:${renterId}`).emit('dispute:newEvidence', payload);
      }
      if (ownerId) {
        io.to(`user:${ownerId}`).emit('dispute:newEvidence', payload);
      }
    });

    // When admin makes decision
    socket.on('dispute:adminDecision', (data) => {
      const { disputeId, renterId, ownerId, decision, adminNote, compensationAmount } = data;

      const payload = {
        disputeId,
        decision, // 'RENTER_RIGHT', 'OWNER_RIGHT', 'BOTH_FAULT', 'NO_FAULT'
        adminNote,
        compensationAmount,
        timestamp: new Date(),
        message: 'Admin đã đưa ra quyết định cho khiếu nại của bạn'
      };

      // Notify both parties
      if (renterId) {
        io.to(`user:${renterId}`).emit('dispute:adminDecisionMade', payload);
      }
      if (ownerId) {
        io.to(`user:${ownerId}`).emit('dispute:adminDecisionMade', payload);
      }
    });

    // When dispute is resolved/completed
    socket.on('dispute:resolved', (data) => {
      const { disputeId, renterId, ownerId, resolution, resolutionSource } = data;

      const payload = {
        disputeId,
        resolution,
        resolutionSource, // 'RESPONDENT_ACCEPTED', 'NEGOTIATION', 'THIRD_PARTY', 'ADMIN'
        timestamp: new Date(),
        message: 'Khiếu nại đã được giải quyết thành công'
      };

      // Notify both parties
      if (renterId) {
        io.to(`user:${renterId}`).emit('dispute:completed', payload);
      }
      if (ownerId) {
        io.to(`user:${ownerId}`).emit('dispute:completed', payload);
      }
    });

    // When payment for dispute is completed
    socket.on('dispute:paymentCompleted', (data) => {
      const { disputeId, renterId, ownerId, amount, paymentType } = data;

      const payload = {
        disputeId,
        amount,
        paymentType, // 'REFUND', 'COMPENSATION', 'PENALTY'
        timestamp: new Date(),
        message: `Thanh toán ${amount?.toLocaleString('vi-VN')}đ đã hoàn tất`
      };

      // Notify both parties
      if (renterId) {
        io.to(`user:${renterId}`).emit('dispute:paymentNotification', payload);
      }
      if (ownerId) {
        io.to(`user:${ownerId}`).emit('dispute:paymentNotification', payload);
      }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      const userId = userSockets.get(socket.id);
      if (userId) {
        userSockets.delete(socket.id);
        // User disconnected from dispute socket
      }
    });
  });

  // Helper function to emit to a specific user
  const emitToUser = (userId, event, data) => {
    if (userId) {
      const userIdStr = userId.toString();
      // Emitting event to user
      io.to(`user:${userIdStr}`).emit(event, data);
    }
  };

  // Helper function to emit to multiple users
  const emitToUsers = (userIds, event, data) => {
    // Emitting to multiple users

    userIds.forEach((userId) => {
      if (userId) {
        const userIdStr = userId.toString();
        const roomName = `user:${userIdStr}`;

        // Check if room has any sockets
        const room = io.sockets.adapter.rooms.get(roomName);
        const socketsInRoom = room ? room.size : 0;

        // Emitting to room
        io.to(roomName).emit(event, data);
      }
    });
  };

  // Helper function to emit to both parties of a dispute
  const emitToDisputeParties = (renterId, ownerId, event, data) => {
    if (renterId) {
      const renterIdStr = renterId.toString();
      // Emitting to renter
      io.to(`user:${renterIdStr}`).emit(event, data);
    }
    if (ownerId) {
      const ownerIdStr = ownerId.toString();
      // Emitting to owner
      io.to(`user:${ownerIdStr}`).emit(event, data);
    }
  };

  return { emitToUser, emitToUsers, emitToDisputeParties };
};

module.exports = initDisputeSocket;
