/**
 * Socket.IO handlers for real-time order updates
 * Handles events between renters and owners
 */

const orderSocketHandler = (io) => {
  // Store user socket connections
  const userSockets = new Map(); // userId -> socketId

  io.on('connection', (socket) => {
    // Order socket connected

    // User authentication and registration
    socket.on('order:register', (userId) => {
      if (userId) {
        userSockets.set(userId.toString(), socket.id);
        socket.userId = userId.toString();
        socket.join(`user:${userId}`); // Join user-specific room
        // User registered for order updates
      }
    });

    // Order created - notify owner
    socket.on('order:created', (data) => {
      const { orderId, ownerId, renterInfo, orderData } = data;

      if (ownerId) {
        // Send to specific owner
        io.to(`user:${ownerId}`).emit('order:new', {
          orderId,
          renterInfo,
          orderData,
          timestamp: new Date()
        });
        // New order notification sent to owner
      }
    });

    // Order status updated - notify both parties
    socket.on('order:statusUpdate', (data) => {
      const { orderId, status, ownerId, renterId, updatedBy } = data;

      // Notify renter
      if (renterId) {
        io.to(`user:${renterId}`).emit('order:statusChanged', {
          orderId,
          status,
          updatedBy,
          timestamp: new Date()
        });
      }

      // Notify owner
      if (ownerId && ownerId !== renterId) {
        io.to(`user:${ownerId}`).emit('order:statusChanged', {
          orderId,
          status,
          updatedBy,
          timestamp: new Date()
        });
      }

      // Order status updated
    });

    // Contract signed - notify both parties
    socket.on('contract:signed', (data) => {
      const { contractId, orderId, signedBy, ownerId, renterId } = data;

      // Notify the other party
      const otherPartyId = signedBy === ownerId ? renterId : ownerId;

      if (otherPartyId) {
        io.to(`user:${otherPartyId}`).emit('contract:signatureReceived', {
          contractId,
          orderId,
          signedBy,
          timestamp: new Date()
        });
        // Contract signature notification sent
      }
    });

    // Contract completed - notify both parties
    socket.on('contract:completed', (data) => {
      const { contractId, orderId, ownerId, renterId } = data;

      // Notify both parties
      [ownerId, renterId].forEach((userId) => {
        if (userId) {
          io.to(`user:${userId}`).emit('contract:fullyExecuted', {
            contractId,
            orderId,
            timestamp: new Date()
          });
        }
      });

      // Contract completed notification sent
    });

    // Payment received - notify owner
    socket.on('payment:received', (data) => {
      const { orderId, ownerId, amount, paymentMethod } = data;

      if (ownerId) {
        io.to(`user:${ownerId}`).emit('payment:notification', {
          orderId,
          amount,
          paymentMethod,
          timestamp: new Date()
        });
        // Payment notification sent to owner
      }
    });

    // Shipment status update
    socket.on('shipment:statusUpdate', (data) => {
      const { shipmentId, status, ownerId, renterId } = data;

      // Notify both parties
      [ownerId, renterId].forEach((userId) => {
        if (userId) {
          io.to(`user:${userId}`).emit('shipment:statusChanged', {
            shipmentId,
            status,
            timestamp: new Date()
          });
        }
      });

      // Shipment status updated
    });

    // Early return request
    socket.on('earlyReturn:requested', (data) => {
      const { requestId, orderId, ownerId } = data;

      if (ownerId) {
        io.to(`user:${ownerId}`).emit('earlyReturn:newRequest', {
          requestId,
          orderId,
          timestamp: new Date()
        });
        // Early return request notification sent to owner
      }
    });

    // Extension request
    socket.on('extension:requested', (data) => {
      const { requestId, orderId, ownerId } = data;

      if (ownerId) {
        io.to(`user:${ownerId}`).emit('extension:newRequest', {
          requestId,
          orderId,
          timestamp: new Date()
        });
        // Extension request notification sent to owner
      }
    });

    // Disconnect handler
    socket.on('disconnect', () => {
      if (socket.userId) {
        userSockets.delete(socket.userId);
        // User disconnected from order updates
      }
      // Order socket disconnected
    });
  });

  return {
    // Helper function to emit to specific user
    emitToUser: (userId, event, data) => {
      if (userId) {
        io.to(`user:${userId}`).emit(event, data);
      }
    },

    // Helper function to emit to multiple users
    emitToUsers: (userIds, event, data) => {
      userIds.forEach((userId) => {
        if (userId) {
          io.to(`user:${userId}`).emit(event, data);
        }
      });
    }
  };
};

module.exports = orderSocketHandler;
