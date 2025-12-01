import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import {
  getNetworks,
  getNetwork,
  createNetwork,
  addGuest,
  removeGuest,
} from '../controllers/network.controller';

const router = Router();

router.get('/', authenticateToken, getNetworks);
router.post('/', authenticateToken, createNetwork);
router.get('/:networkId', authenticateToken, getNetwork);
router.post('/:networkId/guests', authenticateToken, addGuest);
router.delete('/:networkId/guests/:guestId', authenticateToken, removeGuest);

export default router;
