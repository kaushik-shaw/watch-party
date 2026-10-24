'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { io, Socket } from 'socket.io-client';

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: any;
  }
}

interface Participant {
  userId: string;
  username: string;
  role: 'host' | 'moderator' | 'participant';
  isOnline: boolean;
  joinedAt: number;
}

interface PlaybackState {
  videoId: string;
  isPlaying: boolean;
  currentTime: number;
  updatedAt: number;
}

interface RoomSyncState {
  roomCode: string;
  hostId: string;
  playback: PlaybackState;
  participants: Participant[];
}

interface ActivityItem {
  id: string;
  text: string;
  type: 'info' | 'success' | 'warn' | 'error';
  timestamp: string;
}

const SERVER_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:4000';

function extractYouTubeId(urlOrId: string): string | null {
  if (!urlOrId) return null;
  const trimmed = urlOrId.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }
  const regExp = /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/;
  const match = trimmed.match(regExp);
  return match ? match[1] : null;
}

function RoomContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  const roomCode = ((params?.id as string) || '').toUpperCase();
  const initialUsername = searchParams.get('username') || 'Guest';

  // State
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [myUserId, setMyUserId] = useState<string>('');
  const [username] = useState(initialUsername);
  const [syncState, setSyncState] = useState<RoomSyncState | null>(null);
  const [newVideoUrl, setNewVideoUrl] = useState('');
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [toast, setToast] = useState<{ msg: string; type: 'info' | 'error' | 'success' } | null>(null);
  const [copied, setCopied] = useState(false);

  // Player state
  const playerRef = useRef<any>(null);
  const isLocalActionRef = useRef<boolean>(false);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const [playerReady, setPlayerReady] = useState(false);

  const addActivity = useCallback((text: string, type: 'info' | 'success' | 'warn' | 'error' = 'info') => {
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setActivities((prev) => [{ id: Math.random().toString(), text, type, timestamp: timeStr }, ...prev.slice(0, 30)]);
  }, []);

  const showToast = useCallback((msg: string, type: 'info' | 'error' | 'success' = 'info') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // 1. Stable User ID initialization (uses sessionStorage so multiple tabs in the same browser have distinct IDs)
  useEffect(() => {
    const queryUserId = searchParams.get('userId');
    let id = queryUserId || sessionStorage.getItem('wp_userId');
    if (!id) {
      id = 'user_' + Math.random().toString(36).substring(2, 10);
      sessionStorage.setItem('wp_userId', id);
    }
    setMyUserId(id);
  }, [searchParams]);

  // 2. Setup Socket.IO connection
  useEffect(() => {
    if (!myUserId || !roomCode) return;

    const s = io(SERVER_URL, {
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    s.on('connect', () => {
      setConnected(true);
      addActivity(`Connected to server (Socket: ${s.id?.slice(0, 5)}...)`, 'success');

      // Join room
      s.emit(
        'join_room',
        { roomCode, userId: myUserId, username },
        (res: any) => {
          if (!res?.success) {
            // If room not found on join, fallback to create
            s.emit('create_room', { userId: myUserId, username, roomCode });
          }
        }
      );
    });

    s.on('disconnect', () => {
      setConnected(false);
      addActivity('Disconnected from server', 'error');
    });

    s.on('room_joined', (data: any) => {
      setSyncState(data.syncState);
      addActivity(`You joined room [${data.roomCode}] as ${data.participant.role.toUpperCase()}`, 'success');
    });

    s.on('room_created', (data: any) => {
      setSyncState(data.syncState);
      addActivity(`Room [${data.roomCode}] created. You are the HOST 👑`, 'success');
    });

    s.on('sync_state', (state: RoomSyncState) => {
      setSyncState(state);
    });

    s.on('participant_joined', (data: any) => {
      addActivity(`👋 ${data.participant.username} joined the party!`, 'info');
    });

    s.on('participant_left', (data: any) => {
      addActivity(`🚪 ${data.username || 'A user'} left the room`, 'warn');
    });

    s.on('permission_denied', (err: any) => {
      showToast(`⛔ ${err.message}`, 'error');
      addActivity(`⛔ Action Blocked: ${err.message}`, 'error');
    });

    s.on('error', (err: any) => {
      showToast(`⚠️ ${err.message}`, 'error');
    });

    setSocket(s);

    return () => {
      s.disconnect();
    };
  }, [myUserId, roomCode, username, addActivity, showToast]);

  // Current user's role
  const myParticipant = syncState?.participants.find((p) => p.userId === myUserId);
  const isHost = myParticipant?.role === 'host' || syncState?.hostId === myUserId;
  const currentRole = myParticipant?.role || (isHost ? 'host' : 'participant');

  // 3. Initialize YouTube Iframe API
  useEffect(() => {
    if (!window.YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag?.parentNode?.insertBefore(tag, firstScriptTag);
    }

    const initPlayer = () => {
      if (playerRef.current) return;
      const initialVideoId = syncState?.playback?.videoId || 'dQw4w9WgXcQ';

      playerRef.current = new window.YT.Player('youtube-player', {
        height: '100%',
        width: '100%',
        videoId: initialVideoId,
        playerVars: {
          autoplay: 0,
          controls: isHost ? 1 : 0, // Host has native controls, participants synced
          modestbranding: 1,
          rel: 0,
        },
        events: {
          onReady: () => {
            setPlayerReady(true);
            addActivity('YouTube Player initialized', 'info');
          },
          onStateChange: (event: any) => {
            if (!isHost || isLocalActionRef.current) return;

            const time = playerRef.current?.getCurrentTime() || 0;
            // 1 = Playing, 2 = Paused
            if (event.data === 1 && socket) {
              socket.emit('play', { roomCode, userId: myUserId, time });
              addActivity(`▶️ Host played at ${Math.round(time)}s`, 'info');
            } else if (event.data === 2 && socket) {
              socket.emit('pause', { roomCode, userId: myUserId, time });
              addActivity(`⏸️ Host paused at ${Math.round(time)}s`, 'info');
            }
          },
        },
      });
    };

    if (window.YT && window.YT.Player) {
      initPlayer();
    } else {
      (window as any).onYouTubeIframeAPIReady = initPlayer;
    }
  }, [isHost, socket, roomCode, myUserId, addActivity, syncState?.playback?.videoId]);

  // 4. Sync player when room playback state changes
  useEffect(() => {
    if (!playerReady || !playerRef.current || !syncState?.playback) return;

    const { videoId, isPlaying, currentTime } = syncState.playback;
    const player = playerRef.current;

    isLocalActionRef.current = true;

    try {
      // Check if video changed
      const currentUrl = player.getVideoUrl ? player.getVideoUrl() : '';
      if (!currentUrl.includes(videoId)) {
        player.loadVideoById(videoId, currentTime || 0);
        addActivity(`🎬 Video changed to [${videoId}]`, 'info');
      }

      // Check time drift (> 1.5s difference)
      const currentPlayTime = player.getCurrentTime ? player.getCurrentTime() : 0;
      if (Math.abs(currentPlayTime - currentTime) > 1.5) {
        player.seekTo(currentTime, true);
      }

      // Sync play/pause
      const playerState = player.getPlayerState ? player.getPlayerState() : -1;
      if (isPlaying && playerState !== 1) {
        player.playVideo();
      } else if (!isPlaying && playerState === 1) {
        player.pauseVideo();
      }
    } catch {
      // Ignore initial iframe sync hiccups
    } finally {
      setTimeout(() => {
        isLocalActionRef.current = false;
      }, 300);
    }
  }, [syncState?.playback, playerReady, addActivity]);

  // Host Action Handlers
  const handleHostPlay = () => {
    if (!socket || !playerRef.current) return;
    const time = playerRef.current.getCurrentTime() || 0;
    socket.emit('play', { roomCode, userId: myUserId, time });
    playerRef.current.playVideo();
  };

  const handleHostPause = () => {
    if (!socket || !playerRef.current) return;
    const time = playerRef.current.getCurrentTime() || 0;
    socket.emit('pause', { roomCode, userId: myUserId, time });
    playerRef.current.pauseVideo();
  };

  const handleHostSeek = (secondsDelta: number) => {
    if (!socket || !playerRef.current) return;
    const current = playerRef.current.getCurrentTime() || 0;
    const newTime = Math.max(0, current + secondsDelta);
    playerRef.current.seekTo(newTime, true);
    socket.emit('seek', { roomCode, userId: myUserId, time: newTime });
  };

  // Change Video Action (Will succeed for Host, REJECT for Participant)
  const handleChangeVideo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVideoUrl.trim() || !socket) return;

    const extracted = extractYouTubeId(newVideoUrl);
    if (!extracted) {
      showToast('⚠️ Please enter a valid YouTube URL or Video ID', 'error');
      return;
    }

    addActivity(`Requesting video change to [${extracted}]...`, 'info');

    socket.emit(
      'change_video',
      { roomCode, userId: myUserId, videoId: extracted },
      (res: any) => {
        if (res?.success) {
          showToast('🎉 Video changed successfully!', 'success');
          setNewVideoUrl('');
        } else if (res?.error) {
          showToast(`⛔ ${res.error}`, 'error');
        }
      }
    );
  };

  const copyRoomCode = () => {
    navigator.clipboard.writeText(roomCode);
    setCopied(true);
    showToast(`Copied code: ${roomCode}`, 'success');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="min-h-screen w-full flex flex-col justify-between selection:bg-red-500 selection:text-white"
      style={{ backgroundColor: '#F4EBD9' }}
    >
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed top-5 left-1/2 -translate-x-1/2 z-[100] px-6 py-2.5 rounded-full shadow-2xl font-bold text-sm tracking-wide transition-all animate-fade-in ${
            toast.type === 'error'
              ? 'bg-[#E62719] text-white border-2 border-[#18181B]'
              : toast.type === 'success'
              ? 'bg-[#2E7D32] text-white border-2 border-[#18181B]'
              : 'bg-[#1A1614] text-[#F4EBD9]'
          }`}
        >
          {toast.msg}
        </div>
      )}

      {/* ── 1. HEADER NAV ── */}
      <header className="relative z-30 flex items-center justify-between px-4 sm:px-8 py-3.5 border-b-[3px] border-[#383838] bg-white shadow-sm flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/')}
            className="cursor-pointer hover:opacity-90 active:scale-95 transition"
          >
            <span
              className="text-[#E62719] text-4xl sm:text-5xl select-none"
              style={{
                fontFamily: "'Modak', cursive",
                lineHeight: 1,
                WebkitTextStroke: '4px white',
                paintOrder: 'stroke fill',
              }}
            >
              WATCHPARTY
            </span>
          </button>

          {/* Connection Pill */}
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 bg-[#F4EBD9] border-[1.5px] border-[#383838] rounded-full text-xs font-bold font-outfit">
            <span className={`w-2.5 h-2.5 rounded-full ${connected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
            <span className="text-[#1A1614]">{connected ? 'Live Sync' : 'Connecting...'}</span>
          </div>
        </div>

        {/* Room Code Badge & Leave Button */}
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={copyRoomCode}
            className="cursor-pointer flex items-center gap-1.5 bg-[#F4EBD9] hover:bg-[#EAE0CD] border-[2px] border-[#383838] px-3.5 py-1.5 rounded-full font-mono text-sm font-bold text-[#1A1614] shadow-[0_2px_0_#18181B] active:translate-y-[1px] transition"
            title="Click to copy room code"
          >
            <span>ROOM:</span>
            <span className="text-[#E62719] tracking-widest">{roomCode}</span>
            <span className="text-xs">{copied ? '✓' : '📋'}</span>
          </button>

          <button
            onClick={() => router.push('/')}
            className="cursor-pointer bg-[#383838] hover:bg-[#1A1614] text-white px-4 py-1.5 rounded-full font-outfit text-xs sm:text-sm font-bold border-[2px] border-[#18181B] shadow-[0_2px_0_#18181B] active:translate-y-[1px] transition"
          >
            Leave
          </button>
        </div>
      </header>

      {/* ── 2. MAIN STAGE ── */}
      <main className="flex-1 max-w-[1500px] w-full mx-auto p-3 sm:p-5 pb-16 grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">

        {/* LEFT / MAIN COLUMN: Video Player & Controls (8 cols) */}
        <section className="lg:col-span-8 flex flex-col gap-4">

          {/* Video Container */}
          <div className="relative w-full aspect-video bg-black rounded-2xl border-[4px] border-[#383838] shadow-[0_8px_24px_rgba(0,0,0,0.15)] overflow-hidden">
            <div ref={playerContainerRef} id="youtube-player" className="w-full h-full" />

            {!playerReady && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#1A1614] text-white gap-3">
                <span className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin" />
                <p className="font-comic font-bold text-base">Loading YouTube Player...</p>
              </div>
            )}
          </div>

          {/* Control Bar Card */}
          <div className="bg-white rounded-2xl border-[3.5px] border-[#383838] p-4 shadow-[0_4px_0_#18181B] flex flex-col gap-3">

            {/* Video Controls Header */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#F4EBD9] pb-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold font-outfit uppercase px-2.5 py-1 rounded-md bg-[#F4EBD9] border border-[#D8CBB8] text-[#1A1614]">
                  Role: <strong className={isHost ? 'text-[#E62719]' : 'text-blue-600'}>{currentRole.toUpperCase()}</strong>
                </span>

                {isHost ? (
                  <span className="text-xs font-bold text-green-700 bg-green-50 px-2.5 py-0.5 rounded-full border border-green-200">
                    👑 Host Controls
                  </span>
                ) : (
                  <span className="text-xs font-bold text-[#7A6E60] bg-[#F4EBD9] px-2.5 py-0.5 rounded-full border border-[#D8CBB8]">
                    In Sync with Host
                  </span>
                )}
              </div>

              {/* Host Playback Controls */}
              {isHost && (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleHostSeek(-10)}
                    className="cursor-pointer px-3 py-1.5 bg-[#F4EBD9] hover:bg-[#EAE0CD] border-[1.5px] border-[#383838] rounded-xl text-xs font-bold font-outfit active:scale-95 transition"
                    title="Rewind 10 seconds"
                  >
                    ⏪ -10s
                  </button>
                  <button
                    onClick={handleHostPlay}
                    className="cursor-pointer px-4 py-1.5 bg-[#E62719] hover:bg-[#D41E11] text-white border-[1.5px] border-[#18181B] rounded-xl text-xs font-bold font-outfit shadow-[0_2px_0_#18181B] active:translate-y-[1px] transition"
                  >
                    ▶ Play
                  </button>
                  <button
                    onClick={handleHostPause}
                    className="cursor-pointer px-4 py-1.5 bg-[#1A1614] hover:bg-black text-white border-[1.5px] border-[#18181B] rounded-xl text-xs font-bold font-outfit shadow-[0_2px_0_#18181B] active:translate-y-[1px] transition"
                  >
                    ⏸ Pause
                  </button>
                  <button
                    onClick={() => handleHostSeek(10)}
                    className="cursor-pointer px-3 py-1.5 bg-[#F4EBD9] hover:bg-[#EAE0CD] border-[1.5px] border-[#383838] rounded-xl text-xs font-bold font-outfit active:scale-95 transition"
                    title="Forward 10 seconds"
                  >
                    ⏩ +10s
                  </button>
                </div>
              )}
            </div>

            {/* Change Video Form */}
            <form onSubmit={handleChangeVideo} className="flex flex-col sm:flex-row items-center gap-2">
              <input
                type="text"
                value={newVideoUrl}
                onChange={(e) => setNewVideoUrl(e.target.value)}
                placeholder="Paste YouTube Video URL or ID (e.g. https://www.youtube.com/watch?v=...)"
                className="flex-1 w-full px-4 py-2.5 bg-[#F4EBD9] border-[1.5px] border-[#D8CBB8] rounded-xl text-xs sm:text-sm font-outfit text-[#1A1614] placeholder:text-[#64594A] focus:outline-none focus:border-[#E62719] focus:bg-white transition"
              />
              <button
                type="submit"
                className="w-full sm:w-auto px-6 py-2.5 cursor-pointer rounded-xl font-modak text-base tracking-wider border-[2px] border-[#18181B] shadow-[0_3px_0_#18181B] active:translate-y-[2px] transition bg-[#E62719] hover:bg-[#D41E11] text-white flex items-center justify-center gap-1.5 select-none"
              >
                <span>CHANGE VIDEO</span>
              </button>
            </form>
          </div>
        </section>

        {/* RIGHT COLUMN: Participants & Live Activity (4 cols) */}
        <section className="lg:col-span-4 flex flex-col gap-4">

          {/* Participants Card */}
          <div className="bg-white rounded-2xl border-[3.5px] border-[#383838] p-4 shadow-[0_4px_0_#18181B]">
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-[#F4EBD9]">
              <h3 className="font-mouse text-[#E62719] text-2xl uppercase tracking-wider leading-none">
                PARTY MEMBERS ({syncState?.participants?.length || 1})
              </h3>
              <span className="text-xs font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-full border border-green-200">
                ● In Sync
              </span>
            </div>

            <div className="flex flex-col gap-2 max-h-[180px] overflow-y-auto pr-1">
              {syncState?.participants?.map((p) => {
                const isMe = p.userId === myUserId;
                const isUserHost = p.role === 'host';
                return (
                  <div
                    key={p.userId}
                    className={`flex items-center justify-between p-2 rounded-xl border ${
                      isMe
                        ? 'bg-[#F4EBD9]/70 border-[#383838]'
                        : 'bg-white border-[#E0D5C3]'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-base select-none">
                        {isUserHost ? '👑' : '🍿'}
                      </span>
                      <span className="font-outfit text-sm font-bold text-[#1A1614]">
                        {p.username} {isMe && <span className="text-xs text-[#7A6E60] font-normal">(You)</span>}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                          isUserHost
                            ? 'bg-[#E62719] text-white border-[#18181B]'
                            : 'bg-[#FFBA00] text-[#1A1614] border-[#18181B]'
                        }`}
                      >
                        {p.role}
                      </span>
                      <span
                        className={`w-2 h-2 rounded-full ${
                          p.isOnline ? 'bg-green-500' : 'bg-gray-400'
                        }`}
                        title={p.isOnline ? 'Online' : 'Offline'}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Live Activity Feed */}
          <div className="bg-white rounded-2xl border-[3.5px] border-[#383838] p-4 shadow-[0_4px_0_#18181B] flex flex-col flex-1">
            <h3 className="font-mouse text-[#E62719] text-2xl uppercase tracking-wider leading-none mb-3 pb-2 border-b border-[#F4EBD9]">
              LIVE ACTIVITY LOG
            </h3>

            <div className="flex flex-col gap-2 overflow-y-auto max-h-[220px] font-mono text-xs pr-1">
              {activities.length === 0 ? (
                <p className="text-gray-400 italic text-center py-4 font-outfit">Waiting for events...</p>
              ) : (
                activities.map((act) => (
                  <div
                    key={act.id}
                    className={`p-1.5 rounded-lg border text-[11px] flex items-start gap-1.5 ${
                      act.type === 'error'
                        ? 'bg-red-50 text-red-800 border-red-200'
                        : act.type === 'warn'
                        ? 'bg-amber-50 text-amber-800 border-amber-200'
                        : act.type === 'success'
                        ? 'bg-green-50 text-green-800 border-green-200'
                        : 'bg-[#F4EBD9]/60 text-[#1A1614] border-[#E0D5C3]'
                    }`}
                  >
                    <span className="text-[9px] text-gray-500 font-sans">{act.timestamp}</span>
                    <span className="flex-1 leading-snug">{act.text}</span>
                  </div>
                ))
              )}
            </div>
          </div>

        </section>
      </main>
    </div>
  );
}

export default function RoomPage() {
  return (
    <React.Suspense
      fallback={
        <div
          className="min-h-screen w-full flex flex-col items-center justify-center select-none"
          style={{ backgroundColor: '#F4EBD9' }}
        >
          <span
            className="text-[#E62719] text-5xl sm:text-6xl tracking-normal animate-pulse select-none"
            style={{
              fontFamily: "'Modak', cursive",
              WebkitTextStroke: '5px white',
              paintOrder: 'stroke fill',
            }}
          >
            WATCHPARTY
          </span>
          <div className="flex items-center gap-2 mt-4">
            <span className="w-3 h-3 rounded-full bg-[#E62719] animate-bounce [animation-delay:-0.3s]"></span>
            <span className="w-3 h-3 rounded-full bg-[#E62719] animate-bounce [animation-delay:-0.15s]"></span>
            <span className="w-3 h-3 rounded-full bg-[#E62719] animate-bounce"></span>
          </div>
          <p className="font-comic font-bold text-sm text-[#1A1614] mt-2">
            Loading room...
          </p>
        </div>
      }
    >
      <RoomContent />
    </React.Suspense>
  );
}
