import { io as Client } from 'socket.io-client';

const SERVER_URL = 'http://localhost:4000';

async function runTest() {
  console.log('🧪 Starting WatchParty Socket.IO integration test...\n');

  // 1. Connect Host Socket
  console.log('1️⃣ Connecting Host (Alex, userId: user_alex_99)...');
  const hostSocket = Client(SERVER_URL);
  await new Promise<void>((resolve) => hostSocket.on('connect', () => resolve()));
  console.log('✅ Host connected:', hostSocket.id);

  // 2. Host creates room
  const createPromise = new Promise<{ roomCode: string; syncState: any }>((resolve) => {
    hostSocket.on('room_created', (data) => resolve(data));
  });

  hostSocket.emit('create_room', {
    userId: 'user_alex_99',
    username: 'Alex',
  });

  const { roomCode, syncState: hostInitialState } = await createPromise;
  console.log(`✅ Room created successfully! Code: [${roomCode}]`);
  console.log('   Host role in state:', hostInitialState.participants[0]?.role);
  if (hostInitialState.participants[0]?.role !== 'host') {
    throw new Error('Expected creator to have role "host"');
  }

  // 3. Connect Participant Socket (Taylor, userId: user_taylor_88)
  console.log('\n2️⃣ Connecting Participant (Taylor, userId: user_taylor_88)...');
  const participantSocket = Client(SERVER_URL);
  await new Promise<void>((resolve) => participantSocket.on('connect', () => resolve()));
  console.log('✅ Participant connected:', participantSocket.id);

  // 4. Participant joins room
  const joinPromise = new Promise<any>((resolve) => {
    participantSocket.on('room_joined', (data) => resolve(data));
  });

  participantSocket.emit('join_room', {
    roomCode,
    userId: 'user_taylor_88',
    username: 'Taylor',
  });

  const joinData = await joinPromise;
  console.log('✅ Participant joined room!');
  console.log('   Participant role in state:', joinData.participant?.role);
  console.log('   Total participants in room:', joinData.syncState?.participants?.length);
  if (joinData.syncState?.participants?.length !== 2) {
    throw new Error('Expected 2 participants in room');
  }

  // 5. Test Host's events broadcast (Host plays video at 45.0s)
  console.log('\n3️⃣ Testing Host Event Broadcast (Host plays video at time 45.0s)...');
  const hostBroadcastPromise = new Promise<any>((resolve) => {
    participantSocket.on('sync_state', (state) => {
      if (state.playback.isPlaying && state.playback.currentTime === 45) {
        resolve(state);
      }
    });
  });

  hostSocket.emit('play', {
    roomCode,
    userId: 'user_alex_99',
    time: 45,
  });

  const receivedState = await hostBroadcastPromise;
  console.log('✅ Host event broadcast verified! Participant received synced state:');
  console.log(`   isPlaying: ${receivedState.playback.isPlaying}, currentTime: ${receivedState.playback.currentTime}s`);

  // 6. Test Participant change_video is REJECTED (Permission check)
  console.log('\n4️⃣ Testing Participant Permission Guard (Participant attempts change_video)...');
  const permissionDeniedPromise = new Promise<any>((resolve) => {
    participantSocket.on('permission_denied', (err) => resolve(err));
  });

  participantSocket.emit('change_video', {
    roomCode,
    userId: 'user_taylor_88',
    videoId: 'FORBIDDEN_VIDEO_123',
  });

  const deniedResponse = await permissionDeniedPromise;
  console.log('✅ Participant change_video successfully REJECTED!');
  console.log(`   Action: ${deniedResponse.action}`);
  console.log(`   Message: ${deniedResponse.message}`);

  // 7. Test Stable userId Reconnect (reconnect with same userId doesn't duplicate)
  console.log('\n5️⃣ Testing Stable userId Reconnection (Taylor reloads on new socket)...');
  participantSocket.disconnect();

  const reconnectedSocket = Client(SERVER_URL);
  await new Promise<void>((resolve) => reconnectedSocket.on('connect', () => resolve()));

  const reconnectedJoinPromise = new Promise<any>((resolve) => {
    reconnectedSocket.on('room_joined', (data) => resolve(data));
  });

  reconnectedSocket.emit('join_room', {
    roomCode,
    userId: 'user_taylor_88',
    username: 'Taylor',
  });

  const reconnectedData = await reconnectedJoinPromise;
  console.log('✅ Reconnect successful!');
  console.log(`   isReconnect flag: ${reconnectedData.isReconnect}`);
  console.log(`   Total participants (should still be 2, no duplicates): ${reconnectedData.syncState.participants.length}`);
  if (reconnectedData.syncState.participants.length !== 2) {
    throw new Error('Duplicate participant created on reconnect!');
  }

  // Clean up
  hostSocket.disconnect();
  reconnectedSocket.disconnect();

  console.log('\n🎉 ALL ACCEPTANCE CRITERIA PASSED SUCCESSFULLY! 🚀');
}

runTest().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
