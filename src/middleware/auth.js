const jwt = require('jsonwebtoken');
const User = require('../models/user');

const authMiddleware = {
  verifyToken: (req, res, next) => {
    const token = req.headers.token;
    if (token) {
      const accessToken = token.split(' ')[1];
      jwt.verify(accessToken, process.env.JWT_ACCESS_KEY, (err, user) => {
        if (err) {
          return res.status(403).json({ error: 'Token is not valid!' });
        }
        req.user = user;
        next();
      });
    } else {
      return res.status(403).json('You are not authenticated!');
    }
  },
  checkUserRole: (role) => {
    return (req, res, next) => {
      console.log(req.user);
      if (req.user.role === role) {
        next();
      } else {
        return res.status(403).json('You are not allowed to do that!');
      }
    };
  }
};

module.exports = { authMiddleware };
