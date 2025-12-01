# MineCheck Deployment Guide

## Prerequisites

### System Requirements
- Node.js 18.x or higher
- PostgreSQL 14.x or higher
- npm or yarn package manager

### Database Setup

1. Install PostgreSQL
2. Create a database:
```sql
CREATE DATABASE minecheck;
```

3. Create a database user (optional but recommended):
```sql
CREATE USER minecheck_user WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE minecheck TO minecheck_user;
```

## Backend Deployment

### 1. Install Dependencies
```bash
cd backend
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env
```

Edit `.env` and configure:
```env
DATABASE_URL="postgresql://minecheck_user:your_secure_password@localhost:5432/minecheck?schema=public"
JWT_SECRET="generate-a-secure-random-string-here"
JWT_EXPIRES_IN="7d"
PORT=3000
NODE_ENV="production"
CORS_ORIGIN="https://your-frontend-domain.com"
```

**Important**: Generate a strong JWT secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Setup Database
```bash
# Generate Prisma client
npm run prisma:generate

# Run migrations
npm run prisma:migrate

# Optional: Open Prisma Studio to inspect the database
npm run prisma:studio
```

### 4. Create Initial MEGA_ADMIN User

You can use Prisma Studio (`npm run prisma:studio`) or create directly in PostgreSQL:

```sql
-- First, hash a password using Node.js:
-- node -e "console.log(require('bcryptjs').hashSync('YourPassword123', 10))"

INSERT INTO "User" (id, email, password, name, role, "isActive", "createdAt", "updatedAt")
VALUES (
  gen_random_uuid()::text,
  'admin@yourdomain.com',
  '$2a$10$YOUR_HASHED_PASSWORD_HERE',
  'Admin User',
  'MEGA_ADMIN',
  true,
  NOW(),
  NOW()
);
```

### 5. Build and Start

For development:
```bash
npm run dev
```

For production:
```bash
npm run build
npm start
```

### 6. Setup Process Manager (Production)

Using PM2:
```bash
npm install -g pm2
pm2 start dist/index.js --name minecheck-backend
pm2 save
pm2 startup
```

## Frontend Deployment

### 1. Install Dependencies
```bash
cd frontend
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env
```

Edit `.env`:
```env
VITE_API_URL=https://your-api-domain.com/api
```

### 3. Build
```bash
npm run build
```

This creates optimized production files in the `dist` directory.

### 4. Deploy

#### Option A: Static File Server (Nginx)

1. Copy `dist` folder to web server:
```bash
scp -r dist/* user@server:/var/www/minecheck/
```

2. Configure Nginx:
```nginx
server {
    listen 80;
    server_name your-domain.com;

    root /var/www/minecheck;
    index index.html;

    # SPA routing
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API proxy (optional if on same server)
    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

#### Option B: Vercel/Netlify
- Push code to GitHub
- Connect repository to Vercel/Netlify
- Set build command: `npm run build`
- Set output directory: `dist`
- Add environment variable: `VITE_API_URL`

## Reverse Proxy Setup (Nginx)

For production, serve both frontend and backend through Nginx:

```nginx
# Backend API
upstream backend_api {
    server localhost:3000;
}

server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    # Frontend
    root /var/www/minecheck;
    index index.html;

    # API requests
    location /api {
        proxy_pass http://backend_api;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Frontend SPA routing
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Static assets caching
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

## SSL/TLS Certificate

Using Let's Encrypt:
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

## Monitoring and Logs

### Backend Logs (PM2)
```bash
pm2 logs minecheck-backend
pm2 monit
```

### Nginx Logs
```bash
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log
```

## Database Backups

Create automated backups:
```bash
# Backup script
pg_dump -U minecheck_user minecheck > backup_$(date +%Y%m%d_%H%M%S).sql

# Add to crontab for daily backups at 2 AM
0 2 * * * /path/to/backup_script.sh
```

## Security Checklist

- [ ] Use strong JWT_SECRET
- [ ] Enable SSL/TLS certificates
- [ ] Configure CORS properly
- [ ] Use environment variables for secrets
- [ ] Set up firewall rules
- [ ] Enable rate limiting
- [ ] Regular database backups
- [ ] Keep dependencies updated
- [ ] Use strong database passwords
- [ ] Implement proper logging and monitoring

## Troubleshooting

### Backend won't start
1. Check database connection in `.env`
2. Verify PostgreSQL is running: `sudo systemctl status postgresql`
3. Check logs: `pm2 logs minecheck-backend`

### Frontend can't connect to API
1. Verify `VITE_API_URL` in `.env`
2. Check CORS settings in backend
3. Verify backend is running and accessible

### Database migration errors
1. Check DATABASE_URL format
2. Ensure database exists
3. Run `npm run prisma:generate` before migrations

## Updating the Application

```bash
# Backend
cd backend
git pull
npm install
npm run prisma:generate
npm run prisma:migrate
npm run build
pm2 restart minecheck-backend

# Frontend
cd frontend
git pull
npm install
npm run build
# Copy dist to web server or redeploy
```
