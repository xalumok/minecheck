import { Router } from 'express';
import { poll, receiveTelemetry, acknowledgeCommand } from '../controllers/gateway.controller';
import { validateDeviceSignature } from '../middleware/deviceAuth';

const router = Router();

// These endpoints are called by base stations (NodeMCU)
// All requests must include HMAC signature for authentication
router.get('/poll', validateDeviceSignature, poll);
router.post('/telemetry', validateDeviceSignature, receiveTelemetry);
router.post('/ack', validateDeviceSignature, acknowledgeCommand);

export default router;
