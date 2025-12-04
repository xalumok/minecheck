import { Router } from 'express';
import { poll, receiveTelemetry, acknowledgeCommand } from '../controllers/gateway.controller';

const router = Router();

// These endpoints are called by base stations (NodeMCU)
// No authentication required for gateway endpoints
router.get('/poll', poll);
router.post('/telemetry', receiveTelemetry);
router.post('/ack', acknowledgeCommand);

export default router;
