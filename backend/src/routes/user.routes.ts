import { Router } from 'express';
import { authenticateToken, requireRole } from '../middleware/auth';
import { getAllUsers, createUser, updateUser, getCurrentUser } from '../controllers/user.controller';

const router = Router();

// Get current user (any authenticated user)
router.get('/me', authenticateToken, getCurrentUser);

// MEGA_ADMIN only routes
router.get('/', authenticateToken, requireRole(['MEGA_ADMIN']), getAllUsers);
router.post('/', authenticateToken, requireRole(['MEGA_ADMIN']), createUser);
router.patch('/:userId', authenticateToken, requireRole(['MEGA_ADMIN']), updateUser);

export default router;
