require('dotenv').config();
const Bull = require('bull');

async function checkUnfreezeJobs() {
  try {
    const unfreezeQueue = new Bull('wallet-unfreeze', process.env.REDIS_URL || 'redis://127.0.0.1:6379');
    
    console.log('🔍 Checking wallet-unfreeze queue...\n');

    // Get all job counts
    const counts = await unfreezeQueue.getJobCounts();
    console.log('📊 Job counts:');
    console.log(`   Waiting: ${counts.waiting}`);
    console.log(`   Active: ${counts.active}`);
    console.log(`   Completed: ${counts.completed}`);
    console.log(`   Failed: ${counts.failed}`);
    console.log(`   Delayed: ${counts.delayed}\n`);

    // Get delayed jobs (scheduled for future)
    const delayedJobs = await unfreezeQueue.getDelayed(0, 100);
    
    if (delayedJobs.length > 0) {
      console.log(`⏰ Found ${delayedJobs.length} delayed (scheduled) job(s):\n`);
      
      for (const job of delayedJobs) {
        const delay = job.opts.delay;
        const processAt = new Date(job.timestamp + delay);
        const timeUntil = processAt - new Date();
        const hoursUntil = Math.floor(timeUntil / 3600000);
        const minutesUntil = Math.floor((timeUntil % 3600000) / 60000);
        
        console.log(`Job ID: ${job.id}`);
        console.log(`  Wallet ID: ${job.data.walletId}`);
        console.log(`  Amount: ${job.data.amount?.toLocaleString() || 'N/A'} VND`);
        console.log(`  Created: ${new Date(job.timestamp).toLocaleString('vi-VN')}`);
        console.log(`  Delay: ${Math.floor(delay / 3600000)}h ${Math.floor((delay % 3600000) / 60000)}m`);
        console.log(`  Will process at: ${processAt.toLocaleString('vi-VN')}`);
        console.log(`  Time until unlock: ${hoursUntil}h ${minutesUntil}m`);
        console.log();
      }
    } else {
      console.log('ℹ️  No delayed jobs found\n');
    }

    // Get waiting jobs
    const waitingJobs = await unfreezeQueue.getWaiting(0, 10);
    if (waitingJobs.length > 0) {
      console.log(`⏳ Found ${waitingJobs.length} waiting job(s):\n`);
      waitingJobs.forEach(job => {
        console.log(`Job ID: ${job.id}`);
        console.log(`  Wallet ID: ${job.data.walletId}`);
        console.log(`  Amount: ${job.data.amount?.toLocaleString() || 'N/A'} VND\n`);
      });
    }

    // Get active jobs
    const activeJobs = await unfreezeQueue.getActive(0, 10);
    if (activeJobs.length > 0) {
      console.log(`🔄 Found ${activeJobs.length} active job(s):\n`);
      activeJobs.forEach(job => {
        console.log(`Job ID: ${job.id}`);
        console.log(`  Wallet ID: ${job.data.walletId}`);
        console.log(`  Amount: ${job.data.amount?.toLocaleString() || 'N/A'} VND\n`);
      });
    }

    // Get recent completed jobs
    const completedJobs = await unfreezeQueue.getCompleted(0, 5);
    if (completedJobs.length > 0) {
      console.log(`✅ Last ${completedJobs.length} completed job(s):\n`);
      completedJobs.forEach(job => {
        console.log(`Job ID: ${job.id}`);
        console.log(`  Wallet ID: ${job.data.walletId}`);
        console.log(`  Amount: ${job.data.amount?.toLocaleString() || 'N/A'} VND`);
        console.log(`  Finished: ${job.finishedOn ? new Date(job.finishedOn).toLocaleString('vi-VN') : 'N/A'}\n`);
      });
    }

    // Get recent failed jobs
    const failedJobs = await unfreezeQueue.getFailed(0, 5);
    if (failedJobs.length > 0) {
      console.log(`❌ Last ${failedJobs.length} failed job(s):\n`);
      failedJobs.forEach(job => {
        console.log(`Job ID: ${job.id}`);
        console.log(`  Wallet ID: ${job.data.walletId}`);
        console.log(`  Amount: ${job.data.amount?.toLocaleString() || 'N/A'} VND`);
        console.log(`  Error: ${job.failedReason}\n`);
      });
    }

    await unfreezeQueue.close();
    console.log('✅ Queue check complete');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  }
  
  process.exit(0);
}

checkUnfreezeJobs();
