# PIRA Server - React Integration Guide

## 🎯 Cấu hình đã được sửa đổi

### 1. **Express Configuration**
- ✅ Loại bỏ EJS template engine và các middleware liên quan
- ✅ Cập nhật CORS để hỗ trợ React development server
- ✅ Thêm helmet cho bảo mật
- ✅ Cấu hình để serve React build trong production
- ✅ Thêm health check endpoint

### 2. **Package.json Updates**  
- ✅ Loại bỏ các dependencies không cần thiết (EJS, connect-mongo, etc.)
- ✅ Giữ lại các dependencies cần thiết cho API server
- ✅ Cập nhật tên project và mô tả

## 🚀 Cách sử dụng với React Frontend

### **Development Mode**
```bash
# Chạy backend server
npm run dev

# Backend sẽ chạy trên http://localhost:5000
# React development server sẽ chạy trên http://localhost:3000
```

### **Production Mode**
1. Build React app và copy vào folder `build/` của backend
2. Chạy: `npm run production`

## 📡 API Endpoints

Tất cả API endpoints đều có prefix `/api`:
- `GET /health` - Health check
- `POST /api/auth/login` - Authentication
- `GET /api/users` - Get users
- ... (các endpoints khác)

## 🔧 Cấu hình CORS

Server đã được cấu hình để accept requests từ:
- `http://localhost:3000` (React dev server)
- `http://localhost:3001` (Alternative port)
- `http://127.0.0.1:3000`

## 🛡️ Security Features

- ✅ Helmet middleware cho security headers
- ✅ CORS properly configured
- ✅ Request size limits (10MB)
- ✅ Cookie parsing support

## 📝 Next Steps

1. **Tạo React Frontend Project:**
   ```bash
   npx create-react-app pira-frontend
   cd pira-frontend
   npm install axios # Để call API
   ```

2. **Cấu hình API calls trong React:**
   ```javascript
   // src/services/api.js
   import axios from 'axios';

   const API = axios.create({
     baseURL: 'http://localhost:5000/api',
     withCredentials: true,
   });

   export default API;
   ```

3. **Example API call:**
   ```javascript
   // src/components/Login.jsx
   import API from '../services/api';

   const login = async (credentials) => {
     try {
       const response = await API.post('/auth/login', credentials);
       return response.data;
     } catch (error) {
       console.error('Login failed:', error);
     }
   };
   ```

## 🔍 Health Check

Test server health: `GET http://localhost:5000/health`

Response:
```json
{
  "status": "success",
  "message": "Server is running",
  "timestamp": "2025-08-21T...",
  "environment": "development"
}
```
