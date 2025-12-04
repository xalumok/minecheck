import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import {
  getDevices,
  getDevice,
  registerDevice,
  updateDevice,
} from '../controllers/device.controller';

const router = Router();

router.get('/network/:networkId', authenticateToken, getDevices);
router.post('/network/:networkId', authenticateToken, registerDevice);
router.get('/:deviceId', authenticateToken, getDevice);
router.patch('/:deviceId', authenticateToken, updateDevice);

export default router;
