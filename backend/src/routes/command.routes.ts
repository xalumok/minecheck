import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { createCommand, getCommands, getTelemetry } from '../controllers/command.controller';

const router = Router();

router.post('/', authenticateToken, createCommand);
router.get('/network/:networkId', authenticateToken, getCommands);
router.get('/telemetry/:deviceId', authenticateToken, getTelemetry);

export default router;
