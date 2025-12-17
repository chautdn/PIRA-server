# 🚀 GitHub Actions - PIRA Backend

## Tự động deploy khi push code vào `main` hoặc `develop`

---

## ⚙️ SETUP (Chỉ làm 1 lần)

### **BƯỚC 1: Tạo SSH Key trên VPS**

```bash
ssh root@103.200.23.208

# Tạo key (ENTER 3 lần)
ssh-keygen -t ed25519 -C "github-actions" -f ~/.ssh/github_actions_key

# Thêm public key
cat ~/.ssh/github_actions_key.pub >> ~/.ssh/authorized_keys

# Copy private key
cat ~/.ssh/github_actions_key
```

📋 **Copy TOÀN BỘ** từ `-----BEGIN OPENSSH PRIVATE KEY-----` đến `-----END OPENSSH PRIVATE KEY-----`

---

### **BƯỚC 2: Thêm GitHub Secrets**

Vào: **https://github.com/chautdn/PIRA-server/settings/secrets/actions**

Thêm 3 secrets:

| Name          | Value                     |
| ------------- | ------------------------- |
| `VPS_SSH_KEY` | Paste toàn bộ private key |
| `VPS_HOST`    | `103.200.23.208`          |
| `VPS_USER`    | `root`                    |

---

### **BƯỚC 3: Push code để test**

```bash
cd PIRA-server
git add .github/
git commit -m "Add GitHub Actions"
git push origin main
```

Xem logs: **https://github.com/chautdn/PIRA-server/actions**

---

## ✅ Xong!

Từ giờ mỗi lần push → Backend tự động deploy! 🚀
