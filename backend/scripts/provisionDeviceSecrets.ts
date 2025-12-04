import prisma from '../src/utils/prisma';
import { generateDeviceSecret } from '../src/utils/security';

/**
 * Provision device secrets for all devices that don't have one
 * This script should be run after the migration to add deviceSecret field
 */
async function provisionDeviceSecrets() {
  console.log('🔐 Starting device secret provisioning...\n');

  try {
    // Find all devices without a secret
    const devicesWithoutSecret = await prisma.device.findMany({
      where: {
        deviceSecret: null,
      },
      select: {
        id: true,
        boardId: true,
        deviceType: true,
        name: true,
      },
    });

    if (devicesWithoutSecret.length === 0) {
      console.log('✅ All devices already have secrets assigned.');
      return;
    }

    console.log(`Found ${devicesWithoutSecret.length} device(s) without secrets:\n`);

    const results: Array<{ boardId: string; secret: string }> = [];

    // Generate and assign secrets
    for (const device of devicesWithoutSecret) {
      const secret = generateDeviceSecret();
      
      await prisma.device.update({
        where: { id: device.id },
        data: { deviceSecret: secret },
      });

      results.push({
        boardId: device.boardId,
        secret,
      });

      const displayName = device.name || device.boardId;
      console.log(`✅ ${device.deviceType}: ${displayName}`);
      console.log(`   Board ID: ${device.boardId}`);
      console.log(`   Secret:   ${secret}\n`);
    }

    // Save secrets to a file for reference
    const fs = require('fs');
    const outputPath = process.env.SECRETS_OUTPUT_PATH || '/tmp/device_secrets.json';
    
    // Ensure secure permissions on the output file
    const fd = fs.openSync(outputPath, 'w', 0o600); // rw------- (owner only)
    fs.writeSync(fd, JSON.stringify(results, null, 2));
    fs.closeSync(fd);
    
    console.log('\n' + '='.repeat(80));
    console.log('🔐 Device Secret Provisioning Complete!');
    console.log('='.repeat(80));
    console.log(`\n📋 Total devices provisioned: ${results.length}`);
    console.log(`📁 Secrets saved to: ${outputPath}`);
    console.log('   ⚠️  File permissions set to 0600 (owner read/write only)');
    console.log('\n⚠️  IMPORTANT SECURITY NOTES:');
    console.log('   1. Store these secrets securely - they cannot be recovered if lost');
    console.log('   2. Program each device with its corresponding secret');
    console.log('   3. Delete the secrets file after programming devices');
    console.log('   4. Never commit secrets to version control');
    console.log('   5. Set SECRETS_OUTPUT_PATH env var for custom output location');
    console.log('\n💡 Next steps:');
    console.log('   1. Copy secrets from ' + outputPath);
    console.log('   2. Program each NodeMCU/field unit with its secret');
    console.log('   3. Update firmware to include HMAC signing logic');
    console.log('   4. Test with a single device before deploying to all devices');
    console.log('\n');

  } catch (error) {
    console.error('❌ Error provisioning device secrets:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
provisionDeviceSecrets();
