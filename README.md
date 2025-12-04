# MineCheck - LoRa Firework Launch Control System

A production-grade web application to manage a mesh network of LoRa-based firework launch modules.

## System Architecture

### Components
- **Field Units (ATmega-8):** Single firework launchers with GPS and LoRa
- **Base Stations (NodeMCU/ESP8266):** Gateways that bridge LoRa and the Internet
- **Web Application:** Central command & control platform

## Tech Stack

### Backend
- Node.js + Express + TypeScript
- PostgreSQL + Prisma ORM
- JWT-based authentication

### Frontend
- React + Vite + TypeScript
- Tailwind CSS
- React-Leaflet (Map view)
- TanStack Query & Table

## Getting Started

### Prerequisites
- Node.js 18+ and npm
- PostgreSQL 14+

### Backend Setup

```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your database credentials and initial Mega Admin credentials
npm run prisma:generate
npm run prisma:migrate
npx prisma db seed
npm run scenario:setup
npm run scenario:simulate
npm run dev
```

The seed step reads `INITIAL_MEGA_ADMIN_EMAIL`, `INITIAL_MEGA_ADMIN_PASSWORD`, and `INITIAL_MEGA_ADMIN_NAME` from `.env` to ensure a default `MEGA_ADMIN` account exists.

`npm run scenario:setup` ensures a `test@test.com` operator, creates the demo network, and registers both the base station and field unit devices. `npm run scenario:simulate` then generates telemetry (GPS/location, presence) and queues sample commands (IGNITE + GPS update) to mimic real hardware traffic.

### Frontend Setup

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

## Features

- User roles: MEGA_ADMIN, USER, GUEST
- Network management
- Device auto-discovery
- Real-time command queue
- Map and List dashboard views
- Remote diagnostics (Battery, GPS, Ping)
- Ignition control with permission checks

See full documentation in the problem statement.

## License

MIT
