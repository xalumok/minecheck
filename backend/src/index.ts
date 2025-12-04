import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';

// Import routes
import authRoutes from './routes/auth.routes';
import gatewayRoutes from './routes/gateway.routes';
import userRoutes from './routes/user.routes';
import networkRoutes from './routes/network.routes';
import deviceRoutes from './routes/device.routes';
import commandRoutes from './routes/command.routes';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting for API endpoints
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
});

// Lighter rate limiting for gateway polling (base stations poll frequently)
const gatewayLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 120, // Allow 120 polls per minute (2 per second)
  message: 'Polling rate limit exceeded',
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', apiLimiter, authRoutes);
app.use('/api/gateway', gatewayLimiter, gatewayRoutes);
app.use('/api/users', apiLimiter, userRoutes);
app.use('/api/networks', apiLimiter, networkRoutes);
app.use('/api/devices', apiLimiter, deviceRoutes);
app.use('/api/commands', apiLimiter, commandRoutes);

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
  console.log(`📡 Gateway polling endpoint: http://localhost:${PORT}/api/gateway/poll`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
});

export default app;
