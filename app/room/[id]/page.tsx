'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import { UserAvatar } from './avatars';
import {
  getStoredUsername,
  setStoredUsername,
  getStoredUserId,
  getStoredSessionToken,
  setStoredSessionToken,
  clearStoredSessionToken,
} from '@/lib/session';

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: any;
  }
}

interface Participant {
  userId: string;
  username: string;
  role: 'host' | 'moderator' | 'participant' | 'viewer';
  isOnline: boolean;
  joinedAt: number;
}

interface PlaybackState {
  videoId: string;
  isPlaying: boolean;
  currentTime: number;
  updatedAt: number;
  playbackRate?: number;
}

interface RoomSyncState {
  roomCode: string;
  hostId: string;
  playback: PlaybackState;
  participants: Participant[];
}

interface ActionRequest {
  id: string;
  userId: string;
  username: string;
  action: 'pause' | 'play' | 'seek' | 'change_video';
  description: string;
  targetValue?: any;
  timestamp: number;
}

interface ChatMessage {
  id: string;
  userId: string;
  username: string;
  message: string;
  timestamp: number;
}

interface FloatingEmoji {
  id: string;
  emoji: string;
  x: number;
}

const SERVER_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:4000';
const YOUTUBE_IFRAME_API_URL = process.env.NEXT_PUBLIC_YOUTUBE_IFRAME_API_URL || 'https://www.youtube.com/iframe_api';


const QUALITY_REVERSE_MAP: Record<string, string> = {
  'default': 'Auto',
  'auto': 'Auto',
  'highres': '4K (2160p)',
  'hd2160': '4K (2160p)',
  'hd1440': '1440p HD',
  'hd1080': '1080p HD',
  'hd720': '720p HD',
  'large': '480p',
  'medium': '360p',
  'small': '240p',
  'tiny': '144p',
};



function extractYouTubeId(urlOrId: string): string | null {
  if (!urlOrId) return null;
  const trimmed = urlOrId.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }
  const regExp = /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/|live\/))([\w-]{11})/;
  const match = trimmed.match(regExp);
  return match ? match[1] : null;
}

function formatTime(seconds: number): string {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0 || isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

const LogoBurstLeft = () => (
  <svg width="12" height="22" viewBox="0 0 15 22" fill="none" className="select-none flex-shrink-0">
    <path d="M12 4 L4 1.5" stroke="#E62719" strokeWidth="4.5" strokeLinecap="round" />
    <path d="M13 11 L4 11" stroke="#E62719" strokeWidth="4.5" strokeLinecap="round" />
    <path d="M12 18 L4 20.5" stroke="#E62719" strokeWidth="4.5" strokeLinecap="round" />
  </svg>
);

const LogoBurstRight = () => (
  <svg width="12" height="22" viewBox="0 0 15 22" fill="none" className="select-none flex-shrink-0">
    <path d="M3 4 L11 1.5" stroke="#E62719" strokeWidth="4.5" strokeLinecap="round" />
    <path d="M2 11 L11 11" stroke="#E62719" strokeWidth="4.5" strokeLinecap="round" />
    <path d="M3 18 L11 20.5" stroke="#E62719" strokeWidth="4.5" strokeLinecap="round" />
  </svg>
);

const ParticipantLockIcon = () => (
  <svg width="86" height="74" viewBox="0 0 100 80" fill="none" className="select-none mb-3">
    {/* Left radiating bursts (4 dashes) */}
    <path d="M 22 18 L 10 12" stroke="#E62719" strokeWidth="4.5" strokeLinecap="round" />
    <path d="M 18 34 L 5 32" stroke="#E62719" strokeWidth="4.5" strokeLinecap="round" />
    <path d="M 18 50 L 5 52" stroke="#E62719" strokeWidth="4.5" strokeLinecap="round" />
    <path d="M 22 66 L 10 72" stroke="#E62719" strokeWidth="4.5" strokeLinecap="round" />

    {/* Right radiating bursts (4 dashes) */}
    <path d="M 78 18 L 90 12" stroke="#E62719" strokeWidth="4.5" strokeLinecap="round" />
    <path d="M 82 34 L 95 32" stroke="#E62719" strokeWidth="4.5" strokeLinecap="round" />
    <path d="M 82 50 L 95 52" stroke="#E62719" strokeWidth="4.5" strokeLinecap="round" />
    <path d="M 78 66 L 90 72" stroke="#E62719" strokeWidth="4.5" strokeLinecap="round" />

    {/* White Padlock Shackle */}
    <path
      d="M 37 32 V 23 C 37 15.8 42.8 10 50 10 C 57.2 10 63 15.8 63 23 V 32"
      stroke="white"
      strokeWidth="7"
      strokeLinecap="round"
      fill="none"
    />

    {/* White Padlock Body */}
    <rect x="29" y="30" width="42" height="34" rx="8" fill="white" />

    {/* Black Keyhole */}
    <circle cx="50" cy="44" r="3.5" fill="#18181B" />
    <path d="M 48 44 L 46.5 54 H 53.5 L 52 44 Z" fill="#18181B" />
  </svg>
);

function RoomContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  const roomCode = ((params?.id as string) || '').toUpperCase();

  // Session & JoinGate State
  const [socket, setSocket] = useState<Socket | null>(null);
  const [myUserId, setMyUserId] = useState<string>('');
  const [username, setUsername] = useState<string>('');
  const [isJoinGateOpen, setIsJoinGateOpen] = useState(false);
  const [gateNameInput, setGateNameInput] = useState('');
  const [gateError, setGateError] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<RoomSyncState | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  // UI State
  const [activeTab, setActiveTab] = useState<'people' | 'requests' | 'chat'>('people');
  const [videoInputUrl, setVideoInputUrl] = useState('');
  const [toast, setToast] = useState<{ msg: string; type: 'info' | 'error' | 'success' } | null>(null);
  const [floatingEmojis, setFloatingEmojis] = useState<FloatingEmoji[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [openMenuUserId, setOpenMenuUserId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    type: 'transfer' | 'remove';
    userId: string;
    username: string;
  } | null>(null);
  const menuContainerRef = useRef<HTMLDivElement>(null);

  // Live action requests & Modals
  const [requests, setRequests] = useState<ActionRequest[]>([]);
  const [isSeekModalOpen, setIsSeekModalOpen] = useState(false);
  const [targetSeekTime, setTargetSeekTime] = useState(0);
  const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);
  const [requestVideoInput, setRequestVideoInput] = useState('');

  // Player state
  const playerRef = useRef<any>(null);
  const [playerReady, setPlayerReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [actualPlayerState, setActualPlayerState] = useState<number>(-1);
  const [showLockOverlay, setShowLockOverlay] = useState(false);
  const lockOverlayTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lockOverlayOpenedAtRef = useRef<number>(0);
  const isLocalActionRef = useRef<boolean>(false);

  useEffect(() => {
    return () => {
      if (lockOverlayTimerRef.current) {
        clearTimeout(lockOverlayTimerRef.current);
      }
    };
  }, []);

  // Sync references to prevent stale closures in event listeners
  const syncStateRef = useRef<RoomSyncState | null>(null);
  const isHostRef = useRef<boolean>(false);
  const isPlayingRef = useRef<boolean>(false);
  const socketRef = useRef<Socket | null>(null);
  const roomCodeRef = useRef<string>(roomCode);
  const myUserIdRef = useRef<string>(myUserId);

  const getEstimatedTime = useCallback((playback?: PlaybackState | null): number => {
    if (!playback) return 0;
    if (!playback.isPlaying) return playback.currentTime || 0;
    const rate = playback.playbackRate || 1.0;
    const elapsed = Math.max(0, (Date.now() - playback.updatedAt) / 1000) * rate;
    return Math.round((playback.currentTime + elapsed) * 100) / 100;
  }, []);

  const showToast = useCallback((msg: string, type: 'info' | 'error' | 'success' = 'info') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // 1. Session initialization: check URL query, then localStorage, or trigger JoinGate
  useEffect(() => {
    const queryUser = searchParams.get('username');
    if (queryUser && queryUser.trim()) {
      const cleanUser = queryUser.trim();
      setStoredUsername(cleanUser);
      setUsername(cleanUser);
      setIsJoinGateOpen(false);
      // Clean query parameter from address bar URL
      if (typeof window !== 'undefined') {
        window.history.replaceState({}, '', `/room/${roomCode}`);
      }
    } else {
      const stored = getStoredUsername();
      if (stored && stored.trim()) {
        setUsername(stored.trim());
        setIsJoinGateOpen(false);
      } else {
        setIsJoinGateOpen(true);
      }
    }

    setMyUserId(getStoredUserId());
  }, [searchParams, roomCode]);

  // Close ⋮ menu on outside click and Esc key
  useEffect(() => {
    if (!openMenuUserId) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenMenuUserId(null);
      }
    };

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement;
      if (
        menuContainerRef.current &&
        !menuContainerRef.current.contains(target) &&
        !target.closest(`[data-menu-trigger="${openMenuUserId}"]`)
      ) {
        setOpenMenuUserId(null);
      }
    };

    const closeMenu = () => setOpenMenuUserId(null);

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('pointerdown', handlePointerDown);
    // The menu is positioned from the button's screen position, so close it if that moves
    window.addEventListener('resize', closeMenu);
    window.addEventListener('scroll', closeMenu, true);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('resize', closeMenu);
      window.removeEventListener('scroll', closeMenu, true);
    };
  }, [openMenuUserId]);




  // 2. Setup Socket.IO connection
  useEffect(() => {
    if (!myUserId || !roomCode || !username) return;

    const s = io(SERVER_URL, {
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    s.on('connect_error', () => {
      setConnectionError('Connecting to server... (Server waking up, Render may take ~50s)');
    });

    s.on('connect', () => {
      setConnectionError(null);
      const isCreate = searchParams.get('create') === 'true';
      const savedToken = getStoredSessionToken(roomCode);

      s.emit(
        'join_room',
        {
          roomCode,
          userId: myUserId,
          username,
          create: isCreate,
          sessionToken: savedToken,
        },
        (res: any) => {
          if (res?.success) {
            if (res.sessionToken) {
              setStoredSessionToken(roomCode, res.sessionToken);
            }
          } else {
            showToast(
              res?.error === 'ROOM_NOT_FOUND'
                ? 'Room not found! Redirecting...'
                : (res?.error || 'Unable to join room'),
              'error'
            );
            setTimeout(() => router.push('/'), 1800);
          }
        }
      );
    });

    s.on('room_joined', (data: any) => {
      if (data?.sessionToken) {
        setStoredSessionToken(roomCode, data.sessionToken);
      }
      setSyncState(data.syncState);
    });

    s.on('room_created', (data: any) => {
      if (data?.sessionToken) {
        setStoredSessionToken(roomCode, data.sessionToken);
      }
      setSyncState(data.syncState);
    });

    s.on('sync_state', (state: RoomSyncState) => {
      setSyncState(state);
      if (state.playback?.playbackRate && playerRef.current?.setPlaybackRate) {
        try {
          playerRef.current.setPlaybackRate(state.playback.playbackRate);
        } catch {}
      }
    });

    s.on('time_update', (data: { time: number; isPlaying: boolean }) => {
      if (isHost || !playerRef.current) return;
      try {
        const cur = playerRef.current.getCurrentTime ? playerRef.current.getCurrentTime() : 0;
        if (Math.abs(cur - data.time) > 1.5) {
          playerRef.current.seekTo(data.time, true);
        }
        if (data.isPlaying && playerRef.current.getPlayerState?.() !== 1) {
          playerRef.current.playVideo();
        } else if (!data.isPlaying && playerRef.current.getPlayerState?.() === 1) {
          playerRef.current.pauseVideo();
        }
      } catch {}
    });

    s.on('reaction_received', (data: any) => {
      triggerFloatingEmoji(data.emoji);
    });

    s.on('chat_received', (msg: ChatMessage) => {
      setChatMessages((prev) => [...prev, msg]);
    });

    s.on('request_added', (req: ActionRequest) => {
      setRequests((prev) => [req, ...prev.filter((r) => r.id !== req.id)]);
      showToast(`🔔 ${req.username} ${req.description}`, 'info');
    });

    s.on('request_resolved', (data: any) => {
      setRequests((prev) => prev.filter((r) => r.id !== data.requestId));
      if (data.approved) {
        showToast(`✅ Request approved!`, 'success');
      } else {
        showToast(`❌ Request rejected.`, 'info');
      }
    });

    s.on('permission_denied', (err: any) => {
      showToast(`⛔ ${err.message}`, 'error');
    });

    s.on('user_joined', (data: any) => {
      if (data.userId !== myUserId) {
        showToast(`👋 ${data.username} joined!`, 'info');
      }
      if (data.participants && Array.isArray(data.participants)) {
        setSyncState((prev) => (prev ? { ...prev, participants: data.participants } : prev));
      }
    });

    s.on('user_left', (data: any) => {
      if (data.userId !== myUserId) {
        showToast(`👋 ${data.username || 'A participant'} left`, 'info');
      }
      if (data.participants && Array.isArray(data.participants)) {
        setSyncState((prev) => (prev ? { ...prev, participants: data.participants } : prev));
      }
    });

    s.on('role_assigned', (data: any) => {
      showToast(`🛡️ ${data.username} is now ${data.role}!`, 'success');
      if (data.participants && Array.isArray(data.participants)) {
        setSyncState((prev) => {
          if (!prev) return prev;
          const newHostId = data.hostId || (data.role === 'host' ? data.userId : prev.hostId);
          return {
            ...prev,
            hostId: newHostId,
            participants: data.participants,
          };
        });
      }
    });

    s.on('participant_removed', (data: any) => {
      if (data.userId === myUserId) {
        showToast('⚠️ You were removed from the room', 'error');
        setTimeout(() => router.push('/'), 1200);
      } else {
        showToast('A participant was removed by the host', 'info');
        if (data.participants && Array.isArray(data.participants)) {
          setSyncState((prev) => (prev ? { ...prev, participants: data.participants } : prev));
        }
      }
    });

    s.on('kicked', (data: any) => {
      showToast(`⚠️ ${data?.message || 'You were removed from the room'}`, 'error');
      setTimeout(() => router.push('/'), 1200);
    });

    setSocket(s);

    // NOTE: no leave_room on unload/cleanup. A page refresh also fires beforeunload/pagehide,
    // and sending leave_room there made the server think the host quit and hand over the room.
    // A plain disconnect is enough: the server gives the user a short grace period to come
    // back (refresh) and only removes them if they don't. Only the Leave button emits leave_room.
    return () => {
      s.off('connect');
      s.off('connect_error');
      s.off('room_joined');
      s.off('room_created');
      s.off('sync_state');
      s.off('user_joined');
      s.off('user_left');
      s.off('role_assigned');
      s.off('participant_removed');
      s.off('reaction_received');
      s.off('chat_received');
      s.off('request_added');
      s.off('request_resolved');
      s.off('permission_denied');
      s.off('kicked');
      s.disconnect();
    };
  }, [myUserId, roomCode, username, searchParams, showToast, router]);

  // Current participant role
  const myParticipant = syncState?.participants.find((p) => p.userId === myUserId);
  const isHost = syncState ? syncState.hostId === myUserId : false;
  const myRole = myParticipant?.role || (isHost ? 'host' : 'participant');
  const isParticipant = !isHost && myRole !== 'moderator';

  // Synchronize refs with fresh state values for callbacks and event handlers
  const myRoleRef = useRef<string>(myRole);
  useEffect(() => { syncStateRef.current = syncState; }, [syncState]);
  useEffect(() => { isHostRef.current = isHost; }, [isHost]);
  useEffect(() => { myRoleRef.current = myRole; }, [myRole]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { socketRef.current = socket; }, [socket]);
  useEffect(() => { roomCodeRef.current = roomCode; }, [roomCode]);
  useEffect(() => { myUserIdRef.current = myUserId; }, [myUserId]);

  // Automatically reset to people tab if participant has requests tab open
  useEffect(() => {
    if (isParticipant && activeTab === 'requests') {
      setActiveTab('people');
    }
  }, [isParticipant, activeTab]);

  const handleParticipantVideoClick = () => {
    if (!isParticipant) return;

    // Unmute if muted by browser autoplay policy and ensure playing in sync
    if (playerRef.current) {
      try {
        if (typeof playerRef.current.isMuted === 'function' && playerRef.current.isMuted()) {
          playerRef.current.unMute();
        }
        if (syncStateRef.current?.playback?.isPlaying && typeof playerRef.current.getPlayerState === 'function' && playerRef.current.getPlayerState() !== 1) {
          playerRef.current.playVideo();
        }
      } catch {}
    }

    const now = Date.now();
    // Dismiss only if overlay has already been clearly visible for over 500ms
    if (showLockOverlay && now - lockOverlayOpenedAtRef.current > 500) {
      setShowLockOverlay(false);
      if (lockOverlayTimerRef.current) {
        clearTimeout(lockOverlayTimerRef.current);
        lockOverlayTimerRef.current = null;
      }
      return;
    }

    // Show lock overlay and automatically fade out smoothly after 2.8s
    lockOverlayOpenedAtRef.current = now;
    setShowLockOverlay(true);
    if (lockOverlayTimerRef.current) {
      clearTimeout(lockOverlayTimerRef.current);
    }
    lockOverlayTimerRef.current = setTimeout(() => {
      setShowLockOverlay(false);
    }, 2800);
  };

  const handleRequestPlayPause = () => {
    if (!socket) return;
    const nextAction = isPlaying ? 'pause' : 'play';
    socket.emit('action_request', {
      roomCode,
      userId: myUserId,
      username,
      action: nextAction,
      targetValue: currentTime,
      description: `wants to ${nextAction === 'pause' ? 'Pause' : 'Play'} the video`,
    });
    showToast(`Requested Host to ${nextAction === 'pause' ? 'pause' : 'play'} video ⏯️`, 'info');
  };

  const handleSendSeekRequest = () => {
    if (!socket) return;
    socket.emit('action_request', {
      roomCode,
      userId: myUserId,
      username,
      action: 'seek',
      targetValue: targetSeekTime,
      description: `wants to seek to ${formatTime(targetSeekTime)}`,
    });
    showToast(`Requested Host to seek to ${formatTime(targetSeekTime)} ⏩`, 'info');
    setIsSeekModalOpen(false);
  };

  const handleSendVideoRequest = () => {
    if (!socket || !requestVideoInput.trim()) return;
    const extracted = extractYouTubeId(requestVideoInput);
    if (!extracted) {
      showToast('⚠️ Please enter a valid YouTube URL', 'error');
      return;
    }
    socket.emit('action_request', {
      roomCode,
      userId: myUserId,
      username,
      action: 'change_video',
      targetValue: extracted,
      description: 'wants to play a new video',
    });
    showToast('Requested Host to play new video 🎬', 'info');
    setRequestVideoInput('');
    setIsVideoModalOpen(false);
  };

  // Trigger floating reaction emoji
  const triggerFloatingEmoji = (emoji: string) => {
    const id = Math.random().toString();
    const x = Math.floor(Math.random() * 70) + 15; // 15% to 85%
    setFloatingEmojis((prev) => [...prev, { id, emoji, x }]);
    setTimeout(() => {
      setFloatingEmojis((prev) => prev.filter((item) => item.id !== id));
    }, 2800);
  };

  const handleSendReaction = (emoji: string) => {
    triggerFloatingEmoji(emoji);
    if (socket) {
      socket.emit('reaction', { roomCode, userId: myUserId, username, emoji });
    }
  };

  // 3. YouTube Iframe API Initialization
  useEffect(() => {
    if (!window.YT) {
      const tag = document.createElement('script');
      tag.src = YOUTUBE_IFRAME_API_URL;
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag?.parentNode?.insertBefore(tag, firstScriptTag);
    }

    const initPlayer = () => {
      if (playerRef.current) return;
      const initialVideoId = syncState?.playback?.videoId;
      if (!initialVideoId) return;

      playerRef.current = new window.YT.Player('youtube-player', {
        height: '100%',
        width: '100%',
        videoId: initialVideoId,
        playerVars: {
          autoplay: 0,
          controls: 1,
          modestbranding: 1,
          rel: 0,
          disablekb: 0,
          enablejsapi: 1,
        },
        events: {
          onReady: () => {
            setPlayerReady(true);
            try {
              const dur = playerRef.current?.getDuration();
              if (typeof dur === 'number' && Number.isFinite(dur) && dur > 0) {
                setDuration(dur);
              } else {
                setDuration(0);
              }
              // Immediately sync to current room playback state
              const currentSync = syncStateRef.current;
              if (currentSync?.playback) {
                const targetTime = getEstimatedTime(currentSync.playback);
                if (targetTime > 0) {
                  playerRef.current.seekTo(targetTime, true);
                }
                if (currentSync.playback.isPlaying) {
                  try {
                    playerRef.current.playVideo();
                  } catch {}
                }
              }
            } catch {}
          },
          onPlaybackQualityChange: (event: any) => {
            const currentQualityCode = event?.data;
            if (currentQualityCode) {
              const label = QUALITY_REVERSE_MAP[currentQualityCode] || currentQualityCode;
              showToast(`📺 Video Quality: ${label}`, 'info');
            }
          },
          onError: (event: any) => {
            const code = event?.data;
            let errorMsg = 'Failed to load video';
            if (code === 2) errorMsg = 'Invalid YouTube video ID';
            else if (code === 5) errorMsg = 'HTML5 player error';
            else if (code === 100) errorMsg = 'Video not found or removed';
            else if (code === 101 || code === 150) errorMsg = 'Video owner disabled embedding on other sites';
            showToast(`⚠️ ${errorMsg}`, 'error');
          },
          onStateChange: (event: any) => {
            setActualPlayerState(event.data);
            // 1 = Playing, 2 = Paused
            if (event.data === 1) {
              setIsPlaying(true);
            } else if (event.data === 2) {
              setIsPlaying(false);
            }

            if (isLocalActionRef.current) return;

            // When HOST or MODERATOR directly plays or pauses via video clicks or keyboard shortcuts
            if ((isHostRef.current || myRoleRef.current === 'moderator') && socketRef.current && roomCodeRef.current) {
              const cur = playerRef.current?.getCurrentTime ? playerRef.current.getCurrentTime() : 0;
              if (event.data === 1 && !syncStateRef.current?.playback?.isPlaying) {
                socketRef.current.emit('play', {
                  roomCode: roomCodeRef.current,
                  userId: myUserIdRef.current,
                  time: cur,
                });
              } else if (event.data === 2 && syncStateRef.current?.playback?.isPlaying) {
                socketRef.current.emit('pause', {
                  roomCode: roomCodeRef.current,
                  userId: myUserIdRef.current,
                  time: cur,
                });
              }
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
  }, [syncState?.playback?.videoId, isHost, socket, roomCode, myUserId, showToast, getEstimatedTime]);

  // Clean up any previously stored video quality scaling preference
  useEffect(() => {
    try {
      localStorage.removeItem('wp_video_quality');
    } catch {}
  }, []);

  // Ensure YouTube iframe directly ignores pointer events for participants so clicks reliably hit the lock overlay
  useEffect(() => {
    const updateIframePointerEvents = () => {
      try {
        const iframe =
          playerRef.current?.getIframe?.() ||
          (document.querySelector('#youtube-player-container iframe') as HTMLIFrameElement | null);
        if (iframe) {
          iframe.style.pointerEvents = isParticipant ? 'none' : 'auto';
        }
      } catch {}
    };

    updateIframePointerEvents();
    const interval = setInterval(updateIframePointerEvents, 400);
    return () => clearInterval(interval);
  }, [isParticipant, playerReady]);

  // Sync player position interval & Host seek detection on native player
  useEffect(() => {
    if (!playerReady) return;
    const interval = setInterval(() => {
      if (playerRef.current) {
        try {
          const time = playerRef.current.getCurrentTime();
          const dur = playerRef.current.getDuration();
          if (typeof time === 'number' && Number.isFinite(time)) {
            setCurrentTime(time);

            // If this client is Host or Moderator, detect if they sought on the native YouTube player
            if ((isHostRef.current || myRoleRef.current === 'moderator') && socketRef.current && roomCodeRef.current && syncStateRef.current?.playback) {
              const expectedTime = getEstimatedTime(syncStateRef.current.playback);
              if (Math.abs(time - expectedTime) > 2) {
                socketRef.current.emit('seek', {
                  roomCode: roomCodeRef.current,
                  userId: myUserIdRef.current,
                  time,
                });
              }
            }
          }
          if (typeof dur === 'number' && Number.isFinite(dur) && dur > 0) {
            setDuration(dur);
          } else {
            setDuration(0);
          }
        } catch {}
      }
    }, 500);

    return () => clearInterval(interval);
  }, [playerReady, getEstimatedTime]);

  // Synchronize playback state changes from server
  useEffect(() => {
    if (!playerRef.current || !syncState?.playback || !playerReady) return;

    const { videoId, isPlaying: serverPlaying } = syncState.playback;
    const player = playerRef.current;
    if (!videoId) return;

    const expectedTime = getEstimatedTime(syncState.playback);

    isLocalActionRef.current = true;

    try {
      const currentUrl = player.getVideoUrl ? player.getVideoUrl() : '';
      if (!currentUrl.includes(videoId)) {
        player.loadVideoById({
          videoId,
          startSeconds: expectedTime || 0,
        });
      } else {
        const clientTime = player.getCurrentTime ? player.getCurrentTime() : 0;
        if (Math.abs(clientTime - expectedTime) > 1.2) {
          player.seekTo(expectedTime, true);
        }
      }

      const pState = player.getPlayerState ? player.getPlayerState() : -1;
      if (serverPlaying) {
        if (pState !== 1 && pState !== 3) {
          try {
            player.playVideo();
          } catch {}
        }
      } else {
        if (pState === 1 || pState === 3) {
          player.pauseVideo();
        }
      }
    } catch (err) {
      console.warn('[Sync playback error]', err);
    } finally {
      setTimeout(() => {
        isLocalActionRef.current = false;
      }, 500);
    }
  }, [
    syncState?.playback?.videoId,
    syncState?.playback?.isPlaying,
    syncState?.playback?.currentTime,
    syncState?.playback?.updatedAt,
    playerReady,
    getEstimatedTime,
  ]);

  // Continuous participant drift alignment (only applies to non-controlling participants/viewers)
  useEffect(() => {
    if (!playerReady || !playerRef.current || isHost || myRole === 'moderator' || !syncState?.playback?.videoId) return;

    const interval = setInterval(() => {
      if (!playerRef.current) return;
      try {
        const expected = getEstimatedTime(syncStateRef.current?.playback);
        const actual = playerRef.current.getCurrentTime ? playerRef.current.getCurrentTime() : 0;
        const pState = playerRef.current.getPlayerState ? playerRef.current.getPlayerState() : -1;
        const serverPlaying = syncStateRef.current?.playback?.isPlaying;

        if (serverPlaying) {
          if (Math.abs(actual - expected) > 1.2) {
            playerRef.current.seekTo(expected, true);
          }
          if (pState !== 1 && pState !== 3) {
            try {
              playerRef.current.playVideo();
            } catch {}
          }
        } else {
          if (pState === 1 || pState === 3) {
            playerRef.current.pauseVideo();
          }
          if (Math.abs(actual - expected) > 0.8) {
            playerRef.current.seekTo(expected, true);
          }
        }
      } catch {}
    }, 1200);

    return () => clearInterval(interval);
  }, [playerReady, isHost, myRole, syncState?.playback?.videoId, getEstimatedTime]);

  // Host and Moderator send periodic time sync updates while video is playing
  useEffect(() => {
    if ((!isHost && myRole !== 'moderator') || !isPlaying || !socket || !roomCode) return;
    const interval = setInterval(() => {
      if (playerRef.current && typeof playerRef.current.getCurrentTime === 'function') {
        const cur = playerRef.current.getCurrentTime();
        if (typeof cur === 'number' && Number.isFinite(cur)) {
          socket.emit('sync_time', { roomCode, userId: myUserId, time: cur });
        }
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [isHost, isPlaying, socket, roomCode, myUserId]);


  const handleLoadVideo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!videoInputUrl.trim()) return;

    const extracted = extractYouTubeId(videoInputUrl);
    if (!extracted) {
      showToast('⚠️ Please paste a valid YouTube URL', 'error');
      return;
    }

    if (!isHost && myRole !== 'moderator') {
      if (socket) {
        socket.emit('action_request', {
          roomCode,
          userId: myUserId,
          username,
          action: 'change_video',
          targetValue: extracted,
          description: 'wants to play a new video',
        });
        showToast('Requested Host to play new video 🎬', 'info');
        setVideoInputUrl('');
      }
      return;
    }

    if (socket) {
      socket.emit('change_video', { roomCode, userId: myUserId, videoId: extracted }, (res: any) => {
        if (res?.success) {
          showToast('🎉 Loaded video successfully!', 'success');
          setVideoInputUrl('');
        } else if (res?.error) {
          showToast(`⛔ ${res.error}`, 'error');
        }
      });
    }
  };

  const handleResolveRequest = (request: ActionRequest, approve: boolean) => {
    if (socket) {
      socket.emit('resolve_request', {
        roomCode,
        userId: myUserId,
        requestId: request.id,
        approved: approve,
        action: request.action,
        targetValue: request.targetValue,
      });
    }

    // Dismiss the request from local state immediately
    setRequests((prev) => prev.filter((r) => r.id !== request.id));
    if (approve) {
      showToast(`Approved ${request.username}'s request!`, 'success');
    } else {
      showToast(`Rejected request.`, 'info');
    }
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !socket) return;
    socket.emit('send_chat', { roomCode, userId: myUserId, username, message: chatInput });
    setChatInput('');
  };

  const copyRoomCode = () => {
    navigator.clipboard.writeText(roomCode);
    showToast(`Copied room code: ${roomCode}`, 'success');
  };

  const copyRoomLink = () => {
    const link = typeof window !== 'undefined' ? `${window.location.origin}/room/${roomCode}` : '';
    navigator.clipboard.writeText(link);
    showToast(`Copied room invite link!`, 'success');
  };

  const handleJoinGateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!gateNameInput.trim()) {
      setGateError('Please enter your name');
      return;
    }
    const clean = gateNameInput.trim();
    setStoredUsername(clean);
    setUsername(clean);
    setIsJoinGateOpen(false);
    setGateError(null);
  };

  const handleLeave = () => {
    if (socket) {
      socket.emit('leave_room', { roomCode, userId: myUserId });
    }
    clearStoredSessionToken(roomCode);
    router.push('/');
  };

  // Compile real connected room participants:
  // Dedupe strictly by userId and exclude offline participants
  const mergedParticipants: Participant[] = (() => {
    const list: Participant[] = [];
    const seenUserIds = new Set<string>();

    // 1. Add real online participants from syncState
    (syncState?.participants || []).forEach((p) => {
      if (p.isOnline !== false && !seenUserIds.has(p.userId)) {
        seenUserIds.add(p.userId);
        list.push(p);
      }
    });

    // 2. Ensure current user (me) is in the list only before first syncState arrives
    if (!syncState && myUserId && username && !seenUserIds.has(myUserId)) {
      seenUserIds.add(myUserId);
      list.push({
        userId: myUserId,
        username,
        role: 'participant',
        isOnline: true,
        joinedAt: Date.now(),
      });
    }

    return list;
  })();

  // Render JoinGate if user opens link directly without a name
  if (isJoinGateOpen || !username) {
    return (
      <div
        className="w-full h-[100dvh] flex flex-col items-center justify-center p-4 selection:bg-red-500 selection:text-white"
        style={{ backgroundColor: '#F7EAD0' }}
      >
        <div className="w-full max-w-[360px] bg-white rounded-2xl border border-black p-6 flex flex-col shadow-lg">
          <div className="flex items-center justify-center gap-2 mb-3">
            <span
              className="text-[#E62719] text-3xl font-modak leading-none"
              style={{ WebkitTextStroke: '4px white', paintOrder: 'stroke fill' }}
            >
              WATCHPARTY
            </span>
          </div>

          <div className="text-center mb-4">
            <h2 className="font-mouse text-3xl text-[#1A1614] leading-tight">Join Room</h2>
            <div className="inline-block bg-[#FFECA6] rounded-full px-4 py-0.5 mt-1">
              <span className="font-modak text-[#E62719] text-xl leading-none">{roomCode}</span>
            </div>
          </div>

          <form onSubmit={handleJoinGateSubmit} className="flex flex-col gap-3">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-bold text-[#1A1614] font-outfit">Your name</label>
                {gateError && (
                  <span className="text-xs font-bold text-[#E62719] flex items-center gap-1 font-outfit">
                    ⚠️ {gateError}
                  </span>
                )}
              </div>
              <input
                type="text"
                value={gateNameInput}
                onChange={(e) => {
                  setGateNameInput(e.target.value);
                  if (gateError) setGateError(null);
                }}
                placeholder="Enter your name"
                autoFocus
                className="w-full px-4 py-2.5 bg-[#F4EBD9] border border-black rounded-xl text-sm font-outfit text-[#1A1614] placeholder:text-[#64594A] focus:outline-none focus:bg-white"
              />
            </div>

            <button
              type="submit"
              className="w-full mt-2 cursor-pointer bg-[#E62719] hover:bg-[#D41E11] text-white rounded-full py-3 px-4 font-modak text-xl tracking-wider border-[2px] border-[#18181B] shadow-[0_4px_0_#18181B] active:translate-y-[2px] active:shadow-[0_2px_0_#18181B] transition-all"
            >
              JOIN ROOM
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Prevent host from flashing participant view before first sync_state arrives
  if (!syncState) {
    return (
      <div
        className="w-full h-[100dvh] flex flex-col items-center justify-center p-4 selection:bg-red-500 selection:text-white"
        style={{ backgroundColor: '#F7EAD0' }}
      >
        <div className="flex flex-col items-center gap-4">
          <span
            className="text-[#E62719] text-5xl font-modak tracking-normal select-none"
            style={{
              fontFamily: "'Modak', cursive",
              WebkitTextStroke: '6px white',
              paintOrder: 'stroke fill',
            }}
          >
            WATCHPARTY
          </span>
          <div className="flex items-center gap-2.5 bg-white border border-[#18181B] rounded-full px-5 py-2 shadow-sm">
            <div className="w-4 h-4 border-2 border-[#E62719] border-t-transparent rounded-full animate-spin"></div>
            <span className="font-mouse font-bold text-xl text-[#1A1614] tracking-wide">
              {connectionError || 'Connecting to room...'}
            </span>
          </div>
          {connectionError && (
            <p className="text-xs font-outfit text-[#64594A] max-w-sm text-center">
              Render free tier servers take ~50 seconds to spin up from cold sleep. Please wait a moment!
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className="w-full h-[100dvh] flex flex-col justify-between overflow-hidden selection:bg-red-500 selection:text-white px-3 sm:px-5 md:px-6 pt-2 pb-2.5"
      style={{ backgroundColor: '#F7EAD0' }}
    >
      {/* Server waking up / Connection banner */}
      {connectionError && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[110] px-4 py-1.5 rounded-full bg-[#18181B] text-[#FFECA6] text-xs font-outfit font-semibold flex items-center gap-2 shadow-lg animate-pulse">
          <div className="w-2 h-2 rounded-full bg-amber-400 animate-ping"></div>
          <span>{connectionError}</span>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed top-4 left-1/2 -translate-x-1/2 z-[100] px-6 py-2 rounded-full font-bold text-sm tracking-wide transition-all shadow-md animate-fade-in ${
            toast.type === 'error'
              ? 'bg-[#E62719] text-white'
              : toast.type === 'success'
              ? 'bg-[#2E7D32] text-white'
              : 'bg-[#1A1614] text-[#F7EAD0]'
          }`}
        >
          {toast.msg}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          1. TOP NAVIGATION BAR (Exact match to design)
          ══════════════════════════════════════════════════════════════════════ */}
      <header className="relative z-30 flex items-center justify-between gap-3 py-1 flex-shrink-0 flex-wrap sm:flex-nowrap">
        {/* Left: Logo & Room details */}
        <div className="flex items-center gap-2.5 sm:gap-4 flex-wrap">
          {/* Logo with 3 thick radiating burst accents on both sides */}
          <div className="flex items-center gap-2 cursor-pointer select-none" onClick={() => router.push('/')}>
            <LogoBurstLeft />
            <span
              className="text-[#E62719] text-3xl sm:text-4xl tracking-normal select-none"
              style={{
                fontFamily: "'Modak', cursive",
                lineHeight: 1,
                WebkitTextStroke: '5px white',
                paintOrder: 'stroke fill',
              }}
            >
              WATCHPARTY
            </span>
            <LogoBurstRight />
          </div>

          {/* Room: label & Code Pill */}
          <div className="flex items-center gap-2 ml-8">
            <span className="font-mouse font-bold text-2xl sm:text-3xl tracking-wide text-[#1A1614] leading-none mb-1.5">Room:</span>
            <div className="bg-[#FFECA6] rounded-full px-4 sm:px-5 py-1 sm:py-1.5 flex items-center justify-center">
              <span className="font-modak text-[#E62719] text-xl sm:text-2xl tracking-wider leading-none">
                {roomCode}
              </span>
            </div>
          </div>

          {/* Copy code button */}
          <button
            onClick={copyRoomCode}
            className="cursor-pointer bg-white hover:bg-[#FAF7F0] rounded-full px-3.5 sm:px-4 py-1 sm:py-1.5 flex items-center gap-1.5 text-base sm:text-lg font-mouse font-bold tracking-wide text-[#1A1614] transition"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            <span>Copy code</span>
          </button>

          {/* Copy link button */}
          <button
            onClick={copyRoomLink}
            className="cursor-pointer bg-white hover:bg-[#FAF7F0] rounded-full px-3.5 sm:px-4 py-1 sm:py-1.5 flex items-center gap-1.5 text-base sm:text-lg font-mouse font-bold tracking-wide text-[#1A1614] transition"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
            </svg>
            <span>Copy link</span>
          </button>
        </div>

        {/* Right: User Profile & Leave button */}
        <div className="flex items-center gap-2.5 sm:gap-3 flex-shrink-0">
          {/* User pill */}
          <div className="bg-white rounded-full pl-2 pr-4 py-1 sm:py-1.5 flex items-center gap-2.5">
            <UserAvatar name={username} size={32} />
            <span className="font-mouse font-bold text-xl sm:text-2xl tracking-wide text-[#1A1614] leading-none">{username}</span>
            <span className={`text-[11px] sm:text-xs font-black px-2.5 py-0.5 rounded-full uppercase tracking-wide ${
              isHost ? 'bg-[#FFCC00] text-[#1A1614]' : myRole === 'moderator' ? 'bg-[#9FE3FF] text-[#034C75]' : myRole === 'viewer' ? 'bg-[#E9D5FF] text-[#6B21A8]' : 'bg-[#EAE4D7] text-[#63594C]'
            }`}>
              {isHost ? 'HOST' : myRole.toUpperCase()}
            </span>
          </div>

          {/* Leave button */}
          <button
            onClick={handleLeave}
            className="cursor-pointer bg-[#E62719] hover:bg-[#D41E11] text-white rounded-full px-4 sm:px-5 py-1 sm:py-1.5 flex items-center gap-1.5 font-mouse font-bold text-base sm:text-lg tracking-wide transition"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
              <polyline points="16 17 21 12 16 7"></polyline>
              <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
            <span>Leave</span>
          </button>
        </div>
      </header>

      {/* ══════════════════════════════════════════════════════════════════════
          2. MAIN CONTENT GRID (Locked to remaining viewport height)
          ══════════════════════════════════════════════════════════════════════ */}
      <main className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-3 mt-1 overflow-hidden">
        {/* ── LEFT COLUMN (Video & Controls) ── */}
        <div className="lg:col-span-8 flex flex-col justify-between h-full min-h-0 gap-2">
          {/* A. "Paste YouTube URL" Box (Host / Moderator only) */}
          {!isParticipant && (
            <div className="bg-white rounded-2xl px-3.5 py-2 flex-shrink-0">
              <div className="flex items-center gap-1.5 mb-1.5">
                <h2 className="font-ranchers text-[#E62719] text-lg sm:text-xl tracking-wide leading-none">
                  Paste YouTube URL
                </h2>
              </div>

              <form onSubmit={handleLoadVideo} className="flex items-center gap-2">
                <div className="flex items-center gap-2.5 bg-[#FAF7F0] rounded-full px-3.5 py-1.5 flex-1">
                  <div className="w-5 h-3.5 bg-[#FF0000] rounded-sm flex items-center justify-center flex-shrink-0">
                    <div className="w-0 h-0 border-y-[3px] border-y-transparent border-l-[5px] border-l-white ml-0.5"></div>
                  </div>
                  <input
                    type="text"
                    value={videoInputUrl}
                    onChange={(e) => setVideoInputUrl(e.target.value)}
                    placeholder="https://www.youtube.com/watch?v=..."
                    className="w-full bg-transparent text-lg sm:text-xl font-mouse font-bold tracking-wide text-[#1A1614] placeholder:text-[#8C8273] focus:outline-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={!videoInputUrl.trim()}
                  className="cursor-pointer bg-[#E62719] hover:bg-[#D41E11] text-white font-ranchers text-lg sm:text-xl px-7 py-2 rounded-full transition flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Load
                </button>
              </form>
            </div>
          )}

          {/* B. Video Player Box */}
          <div className="flex-1 min-h-0 flex flex-col relative">
            <div
              id="youtube-player-container"
              onClick={isParticipant ? handleParticipantVideoClick : undefined}
              className={`relative flex-1 min-h-0 w-full bg-[#18181B] rounded-2xl overflow-hidden shadow-md select-none ${
                isParticipant ? 'participant-locked-player' : ''
              }`}
            >
              {/* YouTube Iframe API Mount Container */}
              <div className={`w-full h-full ${!syncState?.playback?.videoId ? 'opacity-0' : ''} ${isParticipant ? 'pointer-events-none' : ''}`}>
                <div id="youtube-player" className="w-full h-full"></div>
              </div>

              {/* No video loaded placeholder */}
              {!syncState?.playback?.videoId && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-[#2B1B2A] via-[#1E1624] to-[#14121A] text-white p-6 select-none z-10">
                  <div className="w-16 h-16 rounded-full bg-[#E62719]/15 flex items-center justify-center mb-3">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#E62719" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="5 3 19 12 5 21 5 3" fill="#E62719"></polygon>
                    </svg>
                  </div>
                  <p className="font-outfit font-bold text-lg sm:text-xl text-center text-[#F7EAD0]">
                    {isParticipant ? 'Waiting for host to select a video' : 'Host: paste a YouTube URL to start'}
                  </p>
                  <p className="text-xs sm:text-sm text-[#8C8273] font-outfit mt-1 text-center">
                    {isParticipant ? 'The video will sync automatically once started' : 'Use the input box above to load any video'}
                  </p>
                </div>
              )}

              {/* Participant & Viewer Tap/Click Trap and Lock Overlay */}
              {isParticipant && (
                <div
                  id="participant-lock-overlay"
                  onClick={handleParticipantVideoClick}
                  className="absolute inset-0 z-30 flex flex-col items-center justify-center p-6 select-none cursor-pointer"
                  style={{
                    backgroundColor: showLockOverlay ? '#141217' : '#000000',
                    opacity: showLockOverlay ? 0.96 : 0.0001,
                    transition: 'opacity 0.25s ease-in-out, background-color 0.25s ease-in-out',
                    pointerEvents: 'auto',
                  }}
                  aria-label="Video player lock"
                >
                  <div
                    className="flex flex-col items-center justify-center transition-all duration-200"
                    style={{
                      opacity: showLockOverlay ? 1 : 0,
                      transform: showLockOverlay ? 'scale(1)' : 'scale(0.95)',
                      pointerEvents: 'none',
                    }}
                  >
                    <ParticipantLockIcon />
                    <h3 className="text-white text-3xl sm:text-4xl font-mouse font-bold tracking-wide text-center drop-shadow-md">
                      You’re a {myRole === 'viewer' ? 'viewer' : 'participant'}
                    </h3>
                    <p className="text-[#EFECE6] text-base sm:text-lg font-mouse font-bold text-center mt-1.5 drop-shadow-sm tracking-wide">
                      Video controls are disabled.
                    </p>
                    <p className="text-[#EFECE6] text-base sm:text-lg font-mouse font-bold text-center drop-shadow-sm tracking-wide">
                      Request changes from the host.
                    </p>
                  </div>
                </div>
              )}

              {/* Floating Emojis Layer */}
              <div className="absolute inset-0 pointer-events-none overflow-hidden z-25">
                {floatingEmojis.map((item) => (
                  <div
                    key={item.id}
                    className="absolute text-4xl select-none animate-float-up"
                    style={{ left: `${item.x}%`, bottom: '20px' }}
                  >
                    {item.emoji}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── RIGHT COLUMN (Sidebar: Tabs & Requests) ── */}
        <div className="lg:col-span-4 flex flex-col justify-between h-full min-h-0 gap-2">
          {/* Tabs Sidebar (People / Chat / Requests) */}
          <div className="bg-white rounded-2xl p-3 flex flex-col flex-1 min-h-0 overflow-hidden shadow-sm">
            {/* Tabs Header: 2 tabs for participant, 3 for host/mod */}
            {isParticipant ? (
              <div className="grid grid-cols-2 gap-2 mb-2.5 flex-shrink-0">
                <button
                  onClick={() => setActiveTab('people')}
                  className={`cursor-pointer rounded-xl px-3 py-2 font-mouse font-bold text-base sm:text-lg tracking-wide flex items-center justify-center gap-2 transition ${
                    activeTab === 'people'
                      ? 'bg-[#E62719] text-white shadow-sm'
                      : 'bg-[#FAF7F0] text-[#1A1614] hover:bg-[#EFEAE0]'
                  }`}
                >
                  <span>👥</span>
                  <span>People ({mergedParticipants.length})</span>
                </button>

                <button
                  onClick={() => setActiveTab('chat')}
                  className={`cursor-pointer rounded-xl px-3 py-2 font-mouse font-bold text-base sm:text-lg tracking-wide flex items-center justify-center gap-2 transition ${
                    activeTab === 'chat'
                      ? 'bg-[#E62719] text-white shadow-sm'
                      : 'bg-[#FAF7F0] text-[#1A1614] hover:bg-[#EFEAE0]'
                  }`}
                >
                  <span>💬</span>
                  <span>Chat</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-1.5 mb-2.5 flex-shrink-0">
                <button
                  onClick={() => setActiveTab('people')}
                  className={`cursor-pointer rounded-xl px-2 py-1.5 font-mouse font-bold text-base sm:text-lg tracking-wide flex items-center justify-center gap-1.5 transition ${
                    activeTab === 'people'
                      ? 'bg-[#E62719] text-white'
                      : 'bg-[#FAF7F0] text-[#1A1614] hover:bg-[#EFEAE0]'
                  }`}
                >
                  <span>👥</span>
                  <span>People ({mergedParticipants.length})</span>
                </button>

                <button
                  onClick={() => setActiveTab('requests')}
                  className={`cursor-pointer rounded-xl px-2 py-1.5 font-mouse font-bold text-base sm:text-lg tracking-wide flex items-center justify-center gap-1.5 transition ${
                    activeTab === 'requests'
                      ? 'bg-[#E62719] text-white'
                      : 'bg-[#FAF7F0] text-[#1A1614] hover:bg-[#EFEAE0]'
                  }`}
                >
                  <span>🕒</span>
                  <span>Requests ({requests.length})</span>
                </button>

                <button
                  onClick={() => setActiveTab('chat')}
                  className={`cursor-pointer rounded-xl px-2 py-1.5 font-mouse font-bold text-base sm:text-lg tracking-wide flex items-center justify-center gap-1.5 transition ${
                    activeTab === 'chat'
                      ? 'bg-[#E62719] text-white'
                      : 'bg-[#FAF7F0] text-[#1A1614] hover:bg-[#EFEAE0]'
                  }`}
                >
                  <span>💬</span>
                  <span>Chat</span>
                </button>
              </div>
            )}

            {/* TAB CONTENT: PEOPLE LIST */}
            {activeTab === 'people' && (
              <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-1.5 pr-0.5">
                {mergedParticipants.map((p) => {
                  const isUserHost = syncState ? p.userId === syncState.hostId : p.role === 'host';
                  const isUserMod = !isUserHost && p.role === 'moderator';
                  const isMe = p.userId === myUserId;

                  return (
                    <div
                      key={p.userId}
                      className={`rounded-2xl p-2 sm:p-2.5 flex items-center justify-between transition ${
                        isUserHost
                          ? 'bg-[#FFF6DA] border border-[#F2DE9C]'
                          : 'bg-[#FAF7F0]/80 hover:bg-[#FAF7F0] border border-[#EBE3D5]'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <UserAvatar name={p.username} size={36} />
                        <span className="font-mouse font-bold text-xl sm:text-2xl tracking-wide text-[#1A1614] leading-none">
                          {p.username}{isMe ? ' (you)' : ''}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 relative">
                        {isUserHost ? (
                          <span className="bg-[#FFCC00] text-[#1A1614] font-black text-[11px] sm:text-xs px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-full uppercase tracking-wide">
                            HOST
                          </span>
                        ) : isUserMod ? (
                          <span className="bg-[#9EE2FF] text-[#054E75] font-black text-[11px] sm:text-xs px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-full uppercase tracking-wide">
                            MOD
                          </span>
                        ) : p.role === 'viewer' ? (
                          <span className="bg-[#E9D5FF] text-[#6B21A8] font-black text-[11px] sm:text-xs px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-full uppercase tracking-wide">
                            VIEWER
                          </span>
                        ) : (
                          <span className="border border-[#D6CBBB] bg-[#FAF7F0] text-[#554C40] font-bold text-[11px] sm:text-xs px-2.5 py-0.5 sm:py-1 rounded-full uppercase">
                            PARTICIPANT
                          </span>
                        )}

                        {isHost && !isUserHost && !isMe && (
                          <button
                            data-menu-trigger={p.userId}
                            onClick={(e) => {
                              if (openMenuUserId === p.userId) {
                                setOpenMenuUserId(null);
                                return;
                              }
                              const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                              const MENU_W = 190;
                              const MENU_H = 300;
                              const left = Math.max(8, Math.min(r.right - MENU_W, window.innerWidth - MENU_W - 8));
                              const top = Math.max(8, Math.min(r.bottom + 4, window.innerHeight - MENU_H - 8));
                              setMenuPos({ top, left });
                              setOpenMenuUserId(p.userId);
                            }}
                            className="cursor-pointer text-[#1A1614] hover:bg-[#EFEAE0] rounded-lg p-1 transition"
                            aria-label={`Options for ${p.username}`}
                          >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                              <circle cx="12" cy="5" r="2.5"></circle>
                              <circle cx="12" cy="12" r="2.5"></circle>
                              <circle cx="12" cy="19" r="2.5"></circle>
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Manage-user menu + confirm dialog: rendered in a portal (position: fixed) so the
                scrolling list can never clip them. */}
            {typeof document !== 'undefined' &&
              openMenuUserId &&
              menuPos &&
              (() => {
                const menuUser = mergedParticipants.find((x) => x.userId === openMenuUserId);
                if (!menuUser) return null;
                const roleOptions: { role: 'moderator' | 'participant' | 'viewer'; icon: string; label: string; toast: string }[] = [
                  { role: 'moderator', icon: '🛡️', label: 'Moderator', toast: `🛡️ Promoted ${menuUser.username} to Moderator` },
                  { role: 'participant', icon: '👤', label: 'Participant', toast: `👤 Set ${menuUser.username} as Participant` },
                  { role: 'viewer', icon: '👁️', label: 'Viewer', toast: `👁️ Set ${menuUser.username} as Viewer` },
                ];
                return createPortal(
                  <div
                    ref={menuContainerRef}
                    style={{ position: 'fixed', top: menuPos.top, left: menuPos.left, maxHeight: 'calc(100vh - 16px)' }}
                    className="z-[90] bg-white rounded-xl shadow-xl p-2 w-[190px] overflow-y-auto flex flex-col gap-1 border border-[#E0D8CB] font-outfit"
                  >
                    <div className="px-2 py-1 text-[10px] font-bold text-[#8C8273] uppercase tracking-wider border-b border-[#EFEAE0]">
                      Manage {menuUser.username}
                    </div>

                    <div className="text-[11px] font-bold text-[#1A1614] px-2 pt-1">Assign Role:</div>
                    <div className="flex flex-col gap-0.5">
                      {roleOptions.map((opt) => (
                        <button
                          key={opt.role}
                          onClick={() => {
                            socket?.emit('assign_role', { roomCode, userId: menuUser.userId, role: opt.role }, (res: any) => {
                              if (res?.success) showToast(opt.toast, 'success');
                              else showToast(`⚠️ ${res?.error || 'Could not change role'}`, 'error');
                            });
                            setOpenMenuUserId(null);
                          }}
                          disabled={menuUser.role === opt.role}
                          className={`text-left px-2 py-1 text-xs rounded-lg flex items-center justify-between transition ${
                            menuUser.role === opt.role
                              ? 'bg-[#EAE4D7]/50 text-[#63594C] font-bold cursor-default'
                              : 'hover:bg-[#FAF7F0] text-[#1A1614] cursor-pointer'
                          }`}
                        >
                          <span>{opt.icon} {opt.label}</span>
                          {menuUser.role === opt.role && <span className="text-[10px] font-bold">✓</span>}
                        </button>
                      ))}
                    </div>

                    <div className="border-t border-[#EFEAE0] my-1"></div>

                    <button
                      onClick={() => {
                        setConfirmAction({ type: 'transfer', userId: menuUser.userId, username: menuUser.username });
                        setOpenMenuUserId(null);
                      }}
                      className="text-left px-2 py-1.5 text-xs font-bold hover:bg-[#FFF8E6] rounded-lg text-[#996500] cursor-pointer flex items-center gap-1.5 transition"
                    >
                      <span>👑</span>
                      <span>Transfer Host</span>
                    </button>

                    <button
                      onClick={() => {
                        setConfirmAction({ type: 'remove', userId: menuUser.userId, username: menuUser.username });
                        setOpenMenuUserId(null);
                      }}
                      className="text-left px-2 py-1.5 text-xs font-bold hover:bg-red-50 text-red-600 rounded-lg cursor-pointer flex items-center gap-1.5 transition"
                    >
                      <span>🚫</span>
                      <span>Remove User</span>
                    </button>
                  </div>,
                  document.body
                );
              })()}

            {typeof document !== 'undefined' &&
              confirmAction &&
              createPortal(
                <div
                  className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
                  onClick={() => setConfirmAction(null)}
                >
                  <div
                    className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-2xl font-outfit"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <h3 className="font-bold text-lg text-[#1A1614]">
                      {confirmAction.type === 'transfer' ? 'Transfer host?' : 'Remove user?'}
                    </h3>
                    <p className="text-sm text-[#554C40] mt-1">
                      {confirmAction.type === 'transfer'
                        ? `${confirmAction.username} becomes the Host and you become a Moderator.`
                        : `${confirmAction.username} will be removed and won't be able to rejoin this room.`}
                    </p>
                    <div className="flex justify-end gap-2 mt-4">
                      <button
                        onClick={() => setConfirmAction(null)}
                        className="px-3.5 py-1.5 rounded-lg text-sm font-bold bg-[#FAF7F0] hover:bg-[#EFEAE0] text-[#1A1614] cursor-pointer transition"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => {
                          const { type, userId, username: targetName } = confirmAction;
                          setConfirmAction(null);
                          socket?.emit(
                            type === 'transfer' ? 'transfer_host' : 'remove_participant',
                            { roomCode, userId },
                            (res: any) => {
                              if (res?.success) {
                                showToast(
                                  type === 'transfer' ? `👑 Host transferred to ${targetName}!` : `🚪 Removed ${targetName}`,
                                  type === 'transfer' ? 'success' : 'info'
                                );
                              } else {
                                showToast(`⚠️ ${res?.error || 'Action failed'}`, 'error');
                              }
                            }
                          );
                        }}
                        className={`px-3.5 py-1.5 rounded-lg text-sm font-bold text-white cursor-pointer transition ${
                          confirmAction.type === 'transfer' ? 'bg-[#996500] hover:bg-[#7a5100]' : 'bg-red-600 hover:bg-red-700'
                        }`}
                      >
                        {confirmAction.type === 'transfer' ? 'Transfer' : 'Remove'}
                      </button>
                    </div>
                  </div>
                </div>,
                document.body
              )}

            {/* TAB CONTENT: CHAT */}
            {activeTab === 'chat' && (
              <div className="flex-1 min-h-0 flex flex-col">
                <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2 pr-1">
                  {chatMessages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full py-8 text-[#8C8273]">
                      <span className="text-2xl mb-1">💬</span>
                      <p className="text-base font-mouse font-bold">No messages yet. Say hello!</p>
                    </div>
                  ) : (
                    chatMessages.map((msg) => (
                      <div key={msg.id} className="flex items-start gap-2">
                        <UserAvatar name={msg.username} size={28} />
                        <div className="bg-[#FAF7F0] border border-[#E0D8CB] rounded-xl p-2.5 flex-1">
                          <div className="flex items-center justify-between">
                            <span className="text-base sm:text-lg font-mouse font-bold tracking-wide text-[#1A1614]">{msg.username}</span>
                            <span className="text-[11px] text-[#8C8273]">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                          <p className="text-xs sm:text-sm text-[#2B2B2B] mt-0.5">{msg.message}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <form onSubmit={handleSendChat} className="flex items-center gap-1.5 mt-2 pt-1.5 border-t border-[#EFEAE0] flex-shrink-0">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Type a message..."
                    className="flex-1 bg-[#FAF7F0] rounded-full px-3 py-1.5 text-base font-mouse font-bold tracking-wide text-[#1A1614] focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="bg-[#E62719] hover:bg-[#D41E11] text-white px-3.5 py-1.5 rounded-full text-base font-mouse font-bold tracking-wide cursor-pointer transition"
                  >
                    Send
                  </button>
                </form>
              </div>
            )}

            {/* TAB CONTENT: REQUESTS LIST (Host / Mod only) */}
            {!isParticipant && activeTab === 'requests' && (
              <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2 pr-0.5">
                {requests.length === 0 ? (
                  <p className="text-base font-mouse font-bold text-center text-[#8C8273] py-4">No pending requests 🎉</p>
                ) : (
                  requests.map((req) => (
                    <div key={req.id} className="flex items-center justify-between p-2.5 rounded-xl bg-[#FAF7F0] border border-[#E0D8CB]">
                      <div className="flex items-center gap-2.5">
                        <UserAvatar name={req.username} size={34} />
                        <div>
                          <p className="text-xl sm:text-2xl font-mouse font-bold tracking-wide text-[#1A1614] leading-tight">{req.username}</p>
                          <p className="text-xs sm:text-sm text-[#6B6155]">{req.description}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleResolveRequest(req, true)}
                          className="w-7 h-7 bg-[#48BB78] hover:bg-[#38A169] text-white rounded-lg flex items-center justify-center font-bold text-sm cursor-pointer transition"
                          title="Approve request"
                        >
                          ✓
                        </button>
                        <button
                          onClick={() => handleResolveRequest(req, false)}
                          className="w-7 h-7 bg-[#E53E3E] hover:bg-[#C53030] text-white rounded-lg flex items-center justify-center font-bold text-sm cursor-pointer transition"
                          title="Reject request"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* React Emoji Card in Bottom Right (Available to all users) */}
          <div className="bg-white rounded-2xl p-2.5 sm:p-3 flex-shrink-0 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5 pl-1">
                <h3 className="font-ranchers text-[#E62719] text-lg sm:text-xl tracking-wide leading-none">
                  React
                </h3>
              </div>
              <span className="text-xs font-outfit font-bold text-[#8C8273]">Click to send vibe</span>
            </div>

            <div className="flex items-center justify-between gap-1.5 sm:gap-2">
              {['👍', '😂', '😮', '❤️', '🔥'].map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => handleSendReaction(emoji)}
                  className="cursor-pointer flex-1 py-1.5 sm:py-2 bg-[#FFF8EC] hover:bg-[#FFEEC7] rounded-xl flex items-center justify-center text-xl sm:text-2xl hover:scale-110 active:scale-95 transition-transform select-none"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        </div>
      </main>

      {/* ══════════════════════════════════════════════════════════════════════
          3. BOTTOM REQUEST ACTION BAR (Participant View)
          ══════════════════════════════════════════════════════════════════════ */}
      {isParticipant && (
        <div className="bg-[#FAF5EB] border-[1.5px] border-[#E5DACB] rounded-2xl sm:rounded-3xl p-3.5 sm:px-6 sm:py-3 flex flex-col md:flex-row items-center justify-between gap-3 mt-2 flex-shrink-0 shadow-xs">
          {/* Left: Heading with bursts & subtitle */}
          <div className="flex flex-col items-center md:items-start text-center md:text-left">
            <div className="flex items-center gap-2">
              <LogoBurstLeft />
              <span className="font-ranchers text-[#E62719] text-2xl sm:text-3xl tracking-wide leading-none">
                Want to change something?
              </span>
              <LogoBurstRight />
            </div>
            <p className="font-mouse font-bold text-base sm:text-lg text-[#1A1614] tracking-wide mt-0.5">
              Send a request to the host. They can approve it.
            </p>
          </div>

          {/* Right: 3 Action Buttons */}
          <div className="flex items-center gap-2.5 sm:gap-3 flex-wrap justify-center">
            {/* 1. Request play / pause */}
            <button
              onClick={handleRequestPlayPause}
              className="cursor-pointer bg-[#FFECA6] hover:bg-[#FFE380] border-[1.5px] border-[#E8CE68] rounded-2xl px-5 py-2 flex items-center gap-3 transition-all hover:scale-[1.02] active:scale-[0.98] shadow-xs"
            >
              <div className="flex items-center gap-1 text-[#1A1614]">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5 3 14 12 5 21 5 3"></polygon>
                  <rect x="15" y="4" width="3" height="16" rx="1"></rect>
                  <rect x="20" y="4" width="3" height="16" rx="1"></rect>
                </svg>
              </div>
              <div className="text-left font-mouse font-bold text-lg sm:text-xl leading-[1.05] text-[#1A1614] tracking-wide">
                <div>Request</div>
                <div>play / pause</div>
              </div>
            </button>

            {/* 2. Request seek */}
            <button
              onClick={() => {
                setTargetSeekTime(Math.round(currentTime));
                setIsSeekModalOpen(true);
              }}
              className="cursor-pointer bg-[#FAF7F0] hover:bg-[#F2ECE0] border-[1.5px] border-[#D8CDBD] rounded-2xl px-5 py-2 flex items-center gap-3 transition-all hover:scale-[1.02] active:scale-[0.98] shadow-xs"
            >
              <div className="text-[#1A1614]">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="11 19 2 12 11 5 11 19"></polygon>
                  <polygon points="22 19 13 12 22 5 22 19"></polygon>
                </svg>
              </div>
              <div className="text-left font-mouse font-bold text-lg sm:text-xl leading-[1.05] text-[#1A1614] tracking-wide">
                <div>Request</div>
                <div>seek</div>
              </div>
            </button>

            {/* 3. Request new video... */}
            <button
              onClick={() => setIsVideoModalOpen(true)}
              className="cursor-pointer bg-[#FAF7F0] hover:bg-[#F2ECE0] border-[1.5px] border-[#D8CDBD] rounded-2xl px-5 py-2 flex items-center gap-3 transition-all hover:scale-[1.02] active:scale-[0.98] shadow-xs"
            >
              <div className="text-[#1A1614]">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                </svg>
              </div>
              <div className="text-left font-mouse font-bold text-lg sm:text-xl leading-[1.05] text-[#1A1614] tracking-wide">
                <div>Request</div>
                <div>new video...</div>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          4. MODALS FOR PARTICIPANT REQUESTS
          ══════════════════════════════════════════════════════════════════════ */}
      {/* Seek Request Modal */}
      {isSeekModalOpen && (
        <div className="fixed inset-0 z-[120] bg-black/60 flex items-center justify-center p-4 backdrop-blur-xs animate-fade-in">
          <div className="bg-[#FFFBF3] border-[2px] border-[#18181B] rounded-3xl p-6 w-full max-w-[420px] shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-2xl">⏪</span>
                <h3 className="font-ranchers text-[#E62719] text-2xl tracking-wide">Request Seek</h3>
              </div>
              <button
                onClick={() => setIsSeekModalOpen(false)}
                className="text-[#64594A] hover:text-[#18181B] font-bold text-xl cursor-pointer p-1"
              >
                ✕
              </button>
            </div>

            <p className="text-xs sm:text-sm font-outfit text-[#64594A]">
              Choose the timestamp you want to jump to. The host can approve it.
            </p>

            {/* Time selector preview */}
            <div className="bg-[#FAF7F0] border border-[#E5DACB] rounded-2xl p-4 flex flex-col items-center justify-center">
              <span className="font-modak text-[#E62719] text-4xl tracking-wider leading-none">
                {formatTime(targetSeekTime)}
              </span>
              <span className="font-outfit text-xs text-[#8C8273] mt-1 font-semibold">
                Current playback: {formatTime(currentTime)} / {formatTime(duration)}
              </span>
            </div>

            {/* Slider */}
            <div className="flex flex-col gap-1">
              <input
                type="range"
                min={0}
                max={duration || 100}
                step={1}
                value={targetSeekTime}
                onChange={(e) => setTargetSeekTime(Number(e.target.value))}
                className="w-full h-2.5 bg-[#DCD3C3] rounded-lg appearance-none cursor-pointer accent-[#E62719]"
              />
              <div className="flex justify-between text-xs font-mono text-[#8C8273] font-bold">
                <span>0:00</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            {/* Quick Jump Buttons */}
            <div className="grid grid-cols-4 gap-2">
              {[-30, -10, 10, 30].map((delta) => (
                <button
                  key={delta}
                  type="button"
                  onClick={() => setTargetSeekTime((prev) => Math.max(0, Math.min(duration || 100, prev + delta)))}
                  className="cursor-pointer py-1.5 bg-[#FAF7F0] hover:bg-[#FFECA6] border border-[#DCD3C3] rounded-xl text-xs font-bold font-mono text-[#1A1614] transition"
                >
                  {delta > 0 ? `+${delta}s` : `${delta}s`}
                </button>
              ))}
            </div>

            {/* Modal Actions */}
            <div className="flex items-center gap-3 mt-2">
              <button
                type="button"
                onClick={() => setIsSeekModalOpen(false)}
                className="flex-1 py-2.5 bg-[#FAF7F0] hover:bg-[#EFEAE0] border border-[#DCD3C3] rounded-full font-mouse font-bold text-lg text-[#1A1614] cursor-pointer transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSendSeekRequest}
                className="flex-1 py-2.5 bg-[#E62719] hover:bg-[#D41E11] text-white rounded-full font-mouse font-bold text-lg tracking-wide cursor-pointer transition shadow-md"
              >
                Send Request
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Video Request Modal */}
      {isVideoModalOpen && (
        <div className="fixed inset-0 z-[120] bg-black/60 flex items-center justify-center p-4 backdrop-blur-xs animate-fade-in">
          <div className="bg-[#FFFBF3] border-[2px] border-[#18181B] rounded-3xl p-6 w-full max-w-[440px] shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-2xl">🔗</span>
                <h3 className="font-ranchers text-[#E62719] text-2xl tracking-wide">Request New Video</h3>
              </div>
              <button
                onClick={() => setIsVideoModalOpen(false)}
                className="text-[#64594A] hover:text-[#18181B] font-bold text-xl cursor-pointer p-1"
              >
                ✕
              </button>
            </div>

            <p className="text-xs sm:text-sm font-outfit text-[#64594A]">
              Paste a YouTube video link to request the host to play it.
            </p>

            <div className="flex items-center gap-2.5 bg-[#FAF7F0] border border-[#E5DACB] rounded-2xl px-3.5 py-2.5">
              <div className="w-5 h-3.5 bg-[#FF0000] rounded-sm flex items-center justify-center flex-shrink-0">
                <div className="w-0 h-0 border-y-[3px] border-y-transparent border-l-[5px] border-l-white ml-0.5"></div>
              </div>
              <input
                type="text"
                value={requestVideoInput}
                onChange={(e) => setRequestVideoInput(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                autoFocus
                className="w-full bg-transparent text-base sm:text-lg font-mouse font-bold tracking-wide text-[#1A1614] placeholder:text-[#8C8273] focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-3 mt-2">
              <button
                type="button"
                onClick={() => setIsVideoModalOpen(false)}
                className="flex-1 py-2.5 bg-[#FAF7F0] hover:bg-[#EFEAE0] border border-[#DCD3C3] rounded-full font-mouse font-bold text-lg text-[#1A1614] cursor-pointer transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSendVideoRequest}
                disabled={!requestVideoInput.trim()}
                className="flex-1 py-2.5 bg-[#E62719] hover:bg-[#D41E11] text-white rounded-full font-mouse font-bold text-lg tracking-wide cursor-pointer transition shadow-md disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Send Request
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function RoomPage() {
  return (
    <React.Suspense
      fallback={
        <div className="h-[100dvh] w-full flex items-center justify-center bg-[#F7EAD0]">
          <div className="flex flex-col items-center gap-3">
            <span
              className="text-[#E62719] text-4xl sm:text-5xl tracking-normal animate-pulse select-none"
              style={{
                fontFamily: "'Modak', cursive",
                WebkitTextStroke: '6px white',
                paintOrder: 'stroke fill',
              }}
            >
              WATCHPARTY
            </span>
            <div className="w-6 h-6 border-3 border-[#E62719] border-t-transparent rounded-full animate-spin"></div>
          </div>
        </div>
      }
    >
      <RoomContent />
    </React.Suspense>
  );
}
