import { Response } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth';
import prisma from '../utils/prisma';

const createNetworkSchema = z.object({
  name: z.string().min(3),
  description: z.string().optional(),
});

const addGuestSchema = z.object({
  userId: z.string(),
  permission: z.enum(['VIEW_ONLY', 'COMMANDER']),
});

/**
 * Get all networks accessible by the current user
 */
export const getNetworks = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // MEGA_ADMIN can see all networks
    if (req.user.role === 'MEGA_ADMIN') {
      const networks = await prisma.network.findMany({
        include: {
          owner: {
            select: { id: true, name: true, email: true },
          },
          _count: {
            select: { devices: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
      return res.json(networks);
    }

    // Users see their owned networks + guest access
    const [ownedNetworks, guestNetworks] = await Promise.all([
      prisma.network.findMany({
        where: { ownerId: req.user.userId },
        include: {
          owner: {
            select: { id: true, name: true, email: true },
          },
          _count: {
            select: { devices: true },
          },
        },
      }),
      prisma.networkGuest.findMany({
        where: { userId: req.user.userId },
        include: {
          network: {
            include: {
              owner: {
                select: { id: true, name: true, email: true },
              },
              _count: {
                select: { devices: true },
              },
            },
          },
        },
      }),
    ]);

    const networks = [
      ...ownedNetworks,
      ...guestNetworks.map(g => ({ ...g.network, guestPermission: g.permission })),
    ];

    res.json(networks);
  } catch (error) {
    console.error('Get networks error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Get a single network by ID
 */
export const getNetwork = async (req: AuthRequest, res: Response) => {
  try {
    const { networkId } = req.params;
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const network = await prisma.network.findUnique({
      where: { id: networkId },
      include: {
        owner: {
          select: { id: true, name: true, email: true },
        },
        devices: true,
        guests: {
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
        },
      },
    });

    if (!network) {
      return res.status(404).json({ error: 'Network not found' });
    }

    // Check access permissions
    const hasAccess =
      req.user.role === 'MEGA_ADMIN' ||
      network.ownerId === req.user.userId ||
      network.guests.some(g => g.userId === req.user.userId);

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(network);
  } catch (error) {
    console.error('Get network error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Create a new network
 */
export const createNetwork = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { name, description } = createNetworkSchema.parse(req.body);

    const network = await prisma.network.create({
      data: {
        name,
        description,
        ownerId: req.user.userId,
      },
      include: {
        owner: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    res.status(201).json(network);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }
    console.error('Create network error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Add a guest to a network
 */
export const addGuest = async (req: AuthRequest, res: Response) => {
  try {
    const { networkId } = req.params;
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { userId, permission } = addGuestSchema.parse(req.body);

    // Verify ownership
    const network = await prisma.network.findUnique({
      where: { id: networkId },
    });

    if (!network) {
      return res.status(404).json({ error: 'Network not found' });
    }

    if (network.ownerId !== req.user.userId && req.user.role !== 'MEGA_ADMIN') {
      return res.status(403).json({ error: 'Only the owner can add guests' });
    }

    const guest = await prisma.networkGuest.create({
      data: {
        networkId,
        userId,
        permission,
      },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    res.status(201).json(guest);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }
    console.error('Add guest error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Remove a guest from a network
 */
export const removeGuest = async (req: AuthRequest, res: Response) => {
  try {
    const { networkId, guestId } = req.params;
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Verify ownership
    const network = await prisma.network.findUnique({
      where: { id: networkId },
    });

    if (!network) {
      return res.status(404).json({ error: 'Network not found' });
    }

    if (network.ownerId !== req.user.userId && req.user.role !== 'MEGA_ADMIN') {
      return res.status(403).json({ error: 'Only the owner can remove guests' });
    }

    await prisma.networkGuest.delete({
      where: { id: guestId },
    });

    res.status(204).send();
  } catch (error) {
    console.error('Remove guest error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
