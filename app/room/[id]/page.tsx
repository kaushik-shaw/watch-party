'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  role: 'host' | 'moderator' | 'participant';
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

const QUALITY_MAP: Record<string, string> = {
  'Auto': 'default',
  '4K (2160p)': 'hd2160',
  '1440p HD': 'hd1440',
  '1080p HD': 'hd1080',
  '720p HD': 'hd720',
  '480p': 'large',
  '360p': 'medium',
  '240p': 'small',
  '144p': 'tiny',
};

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
  const [volume, setVolume] = useState(80);
  const [isMuted, setIsMuted] = useState(false);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [actualPlayerState, setActualPlayerState] = useState<number>(-1);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsSubmenu, setSettingsSubmenu] = useState<'main' | 'speed' | 'quality'>('main');
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [videoQuality, setVideoQuality] = useState('Auto');
  const [availableQualities, setAvailableQualities] = useState<string[]>([
    'Auto',
    '1080p HD',
    '720p HD',
    '480p',
    '360p',
    '240p',
  ]);
  const [isMiniplayer, setIsMiniplayer] = useState(false);
  const [isTheaterMode, setIsTheaterMode] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const settingsMenuRef = useRef<HTMLDivElement>(null);
  const isLocalActionRef = useRef<boolean>(false);

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

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('pointerdown', handlePointerDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [openMenuUserId]);

  // Fullscreen change listener to sync fullscreen state
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  // Click outside to dismiss settings popover
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (settingsMenuRef.current && !settingsMenuRef.current.contains(e.target as Node)) {
        setIsSettingsOpen(false);
      }
    };
    if (isSettingsOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isSettingsOpen]);

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
        setSyncState((prev) => (prev ? { ...prev, participants: data.participants } : prev));
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

    const handleUnload = () => {
      if (s && s.connected) {
        s.emit('leave_room', { roomCode, userId: myUserId });
      }
    };

    window.addEventListener('beforeunload', handleUnload);
    window.addEventListener('pagehide', handleUnload);

    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      window.removeEventListener('pagehide', handleUnload);
      handleUnload();
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
  useEffect(() => { syncStateRef.current = syncState; }, [syncState]);
  useEffect(() => { isHostRef.current = isHost; }, [isHost]);
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
          controls: 0,
          modestbranding: 1,
          rel: 0,
          disablekb: 1,
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
              // Populate available qualities from current video
              if (typeof playerRef.current?.getAvailableQualityLevels === 'function') {
                const levels: string[] = playerRef.current.getAvailableQualityLevels();
                if (Array.isArray(levels) && levels.length > 0) {
                  const mapped = levels
                    .map((lvl) => QUALITY_REVERSE_MAP[lvl] || lvl)
                    .filter((v, i, arr) => arr.indexOf(v) === i);
                  setAvailableQualities(['Auto', ...mapped.filter((x) => x !== 'Auto')]);
                }
              }
            } catch {}
          },
          onPlaybackQualityChange: (event: any) => {
            const currentQualityCode = event?.data;
            if (currentQualityCode) {
              const label = QUALITY_REVERSE_MAP[currentQualityCode] || currentQualityCode;
              setVideoQuality(label);
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

            // When HOST directly plays or pauses via video clicks or keyboard shortcuts
            if (isHostRef.current && socketRef.current && roomCodeRef.current) {
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
  }, [syncState?.playback?.videoId, isHost, socket, roomCode, myUserId, showToast]);

  // Sync player position interval
  useEffect(() => {
    if (!playerReady) return;
    const interval = setInterval(() => {
      if (playerRef.current && !isScrubbing) {
        try {
          const time = playerRef.current.getCurrentTime();
          const dur = playerRef.current.getDuration();
          if (typeof time === 'number' && Number.isFinite(time)) setCurrentTime(time);
          if (typeof dur === 'number' && Number.isFinite(dur) && dur > 0) {
            setDuration(dur);
          } else {
            setDuration(0);
          }
        } catch {}
      }
    }, 500);

    return () => clearInterval(interval);
  }, [playerReady, isScrubbing]);

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

  // Continuous participant drift alignment
  useEffect(() => {
    if (!playerReady || !playerRef.current || isHost || !syncState?.playback?.videoId) return;

    const interval = setInterval(() => {
      if (!playerRef.current || isScrubbing) return;
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
  }, [playerReady, isHost, syncState?.playback?.videoId, isScrubbing, getEstimatedTime]);

  // Host sends periodic time sync updates while video is playing
  useEffect(() => {
    if (!isHost || !isPlaying || !socket || !roomCode) return;
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

  // Controls Handlers
  const handleTogglePlay = () => {
    if (!playerRef.current) return;

    if (!isHost && myRole !== 'moderator') {
      // Non-host sends an action request to host
      if (socket) {
        socket.emit('action_request', {
          roomCode,
          userId: myUserId,
          username,
          action: isPlaying ? 'pause' : 'play',
          description: isPlaying ? 'wants to Pause the video' : 'wants to Play the video',
        });
        showToast('Sent playback request to Host ✨', 'info');
      }
      return;
    }

    const curTime = playerRef.current?.getCurrentTime ? playerRef.current.getCurrentTime() : currentTime;
    if (isPlaying) {
      playerRef.current.pauseVideo();
      setIsPlaying(false);
      if (socket) {
        socket.emit('pause', { roomCode, userId: myUserId, time: curTime });
      }
    } else {
      playerRef.current.playVideo();
      setIsPlaying(true);
      if (socket) {
        socket.emit('play', { roomCode, userId: myUserId, time: curTime });
      }
    }
  };

  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    setCurrentTime(newTime);
  };

  const handleSeekCommit = () => {
    setIsScrubbing(false);
    if (!playerRef.current) return;

    if (!isHost && myRole !== 'moderator') {
      showToast('Only host/mod can seek video', 'info');
      return;
    }

    const cur = playerRef.current.getCurrentTime ? playerRef.current.getCurrentTime() : currentTime;
    playerRef.current.seekTo(cur, true);
    if (socket) {
      socket.emit('seek', { roomCode, userId: myUserId, time: cur });
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    setVolume(val);
    if (playerRef.current) {
      playerRef.current.setVolume(val);
      if (val === 0) {
        setIsMuted(true);
        playerRef.current.mute();
      } else if (isMuted) {
        setIsMuted(false);
        playerRef.current.unMute();
      }
    }
  };

  const toggleMute = () => {
    if (!playerRef.current) return;
    if (isMuted) {
      setIsMuted(false);
      playerRef.current.unMute();
      playerRef.current.setVolume(volume || 50);
    } else {
      setIsMuted(true);
      playerRef.current.mute();
    }
  };

  const handleSelectSpeed = (speed: number) => {
    setPlaybackSpeed(speed);
    if (playerRef.current?.setPlaybackRate) {
      try {
        playerRef.current.setPlaybackRate(speed);
      } catch {}
    }
    setSettingsSubmenu('main');
    setIsSettingsOpen(false);
    showToast(`Speed set to ${speed === 1 ? 'Normal' : `${speed}x`}`, 'info');
  };

  const openQualitySubmenu = () => {
    if (playerRef.current && typeof playerRef.current.getAvailableQualityLevels === 'function') {
      try {
        const levels: string[] = playerRef.current.getAvailableQualityLevels();
        if (Array.isArray(levels) && levels.length > 0) {
          const mapped = levels
            .map((lvl) => QUALITY_REVERSE_MAP[lvl] || lvl)
            .filter((v, i, arr) => arr.indexOf(v) === i);
          setAvailableQualities(['Auto', ...mapped.filter((x) => x !== 'Auto')]);
        }
      } catch {}
    }
    setSettingsSubmenu('quality');
  };

  const handleSelectQuality = (q: string) => {
    setVideoQuality(q);
    const qCode = QUALITY_MAP[q] || 'default';
    if (playerRef.current) {
      try {
        if (typeof playerRef.current.setPlaybackQuality === 'function') {
          playerRef.current.setPlaybackQuality(qCode);
        }
        if (typeof playerRef.current.setPlaybackQualityRange === 'function') {
          playerRef.current.setPlaybackQualityRange(qCode, qCode);
        }
        const curTime = playerRef.current.getCurrentTime ? playerRef.current.getCurrentTime() : currentTime;
        const isCurrentlyPlaying = playerRef.current.getPlayerState ? playerRef.current.getPlayerState() === 1 : isPlaying;

        const vId = syncStateRef.current?.playback?.videoId;
        if (vId && typeof playerRef.current.loadVideoById === 'function') {
          isLocalActionRef.current = true;
          playerRef.current.loadVideoById({
            videoId: vId,
            startSeconds: curTime,
            suggestedQuality: qCode,
          });
          if (!isCurrentlyPlaying) {
            playerRef.current.pauseVideo();
          }
          setTimeout(() => {
            isLocalActionRef.current = false;
          }, 800);
        } else if (typeof playerRef.current.seekTo === 'function') {
          playerRef.current.seekTo(curTime, true);
        }
      } catch (err) {
        console.warn('Error setting quality:', err);
      }
    }
    setSettingsSubmenu('main');
    setIsSettingsOpen(false);
    showToast(`Quality set to ${q}`, 'info');
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    } else {
      const elem = document.getElementById('youtube-player-container');
      if (elem?.requestFullscreen) {
        elem.requestFullscreen().catch(() => {});
      }
    }
  };

  const toggleTheaterMode = () => {
    setIsTheaterMode((prev) => !prev);
  };

  const toggleMiniplayer = () => {
    setIsMiniplayer((prev) => !prev);
  };

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
            style={{ WebkitTextStroke: '6px white', paintOrder: 'stroke fill' }}
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
              isHost ? 'bg-[#FFCC00] text-[#1A1614]' : myRole === 'moderator' ? 'bg-[#9FE3FF] text-[#034C75]' : 'bg-[#EAE4D7] text-[#63594C]'
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
        <div className={`${isTheaterMode ? 'lg:col-span-12' : 'lg:col-span-8'} flex flex-col justify-between h-full min-h-0 gap-2 transition-all duration-300`}>
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

          {/* B. Video Player Box & Integrated Controls Bar */}
          <div className="flex-1 min-h-0 flex flex-col relative">
            {/* 16:9 Video Container that fills available space or floats in Miniplayer mode */}
            <div
              id="youtube-player-container"
              className={`${
                isMiniplayer
                  ? 'fixed bottom-5 right-5 w-80 sm:w-96 aspect-video z-50 rounded-2xl shadow-2xl border-2 border-black/80 overflow-hidden ring-4 ring-black/20 flex flex-col justify-between bg-[#18181B]'
                  : 'relative flex-1 min-h-0 w-full bg-[#18181B] rounded-2xl overflow-hidden flex flex-col justify-between shadow-md'
              }`}
            >
              <div id="youtube-player" className={`w-full h-full ${!syncState?.playback?.videoId ? 'opacity-0 pointer-events-none' : ''}`}></div>

              {/* Miniplayer Expand Button */}
              {isMiniplayer && (
                <button
                  onClick={() => setIsMiniplayer(false)}
                  className="absolute top-2.5 right-2.5 z-40 bg-black/80 hover:bg-black text-white px-2.5 py-1 rounded-lg flex items-center gap-1.5 text-xs font-bold font-mouse cursor-pointer transition shadow-lg border border-white/20"
                  title="Restore player to main view"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                  </svg>
                  <span>Expand</span>
                </button>
              )}

              {!syncState?.playback?.videoId && !isParticipant && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-[#2B1B2A] via-[#1E1624] to-[#14121A] text-white p-6 select-none z-10">
                  <div className="w-16 h-16 rounded-full bg-[#E62719]/15 flex items-center justify-center mb-3">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#E62719" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="5 3 19 12 5 21 5 3" fill="#E62719"></polygon>
                    </svg>
                  </div>
                  <p className="font-outfit font-bold text-lg sm:text-xl text-center text-[#F7EAD0]">
                    Host: paste a YouTube URL to start
                  </p>
                  <p className="text-xs sm:text-sm text-[#8C8273] font-outfit mt-1 text-center">
                    Use the input box above to load any video
                  </p>
                </div>
              )}

              {/* Participant Center Lock Overlay (Only shown when no video is loaded) */}
              {isParticipant && !syncState?.playback?.videoId && (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-6 select-none z-20 pointer-events-none">
                  <ParticipantLockIcon />
                  <h3 className="text-white text-3xl sm:text-4xl font-mouse font-bold tracking-wide text-center drop-shadow-md">
                    You’re a participant
                  </h3>
                  <p className="text-[#EFECE6] text-base sm:text-lg font-mouse font-bold text-center mt-1 drop-shadow-sm tracking-wide">
                    Video controls are disabled.
                  </p>
                  <p className="text-[#EFECE6] text-base sm:text-lg font-mouse font-bold text-center drop-shadow-sm tracking-wide">
                    Request changes from the host.
                  </p>
                </div>
              )}

              {/* Participant Autoplay Unblock Overlay */}
              {isParticipant && syncState?.playback?.videoId && syncState?.playback?.isPlaying && actualPlayerState !== 1 && (
                <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/60 backdrop-blur-xs select-none p-4">
                  <button
                    onClick={() => {
                      if (playerRef.current) {
                        try {
                          playerRef.current.unMute();
                          setIsMuted(false);
                          const targetTime = getEstimatedTime(syncState?.playback);
                          if (targetTime > 0) {
                            playerRef.current.seekTo(targetTime, true);
                          }
                          playerRef.current.playVideo();
                        } catch {}
                        setIsPlaying(true);
                        setActualPlayerState(1);
                      }
                    }}
                    className="cursor-pointer bg-[#E62719] hover:bg-[#D41E11] text-white px-7 py-3.5 rounded-full font-mouse font-bold text-2xl tracking-wide border-2 border-white shadow-2xl flex items-center gap-3 animate-pulse hover:scale-105 transition-transform active:scale-95"
                  >
                    <span className="text-3xl">🔊</span>
                    <span>Click to Unmute & Sync Video</span>
                  </button>
                  <p className="text-white/80 text-sm font-outfit mt-3 text-center">
                    Browser blocked audio autoplay — click above to watch in real-time with host
                  </p>
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

              {/* Integrated Bottom Video Controls Bar */}
              <div className="absolute bottom-0 inset-x-0 z-30 bg-gradient-to-t from-black/90 via-black/60 to-transparent pt-7 pb-2.5 px-3.5 sm:px-4 flex items-center gap-3 select-none text-white">
                {/* Play / Pause Button */}
                <button
                  onClick={isParticipant ? handleRequestPlayPause : handleTogglePlay}
                  className="text-white hover:text-[#E62719] transition cursor-pointer flex-shrink-0"
                  title={isParticipant ? 'Request play/pause from host' : isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? (
                    <div className="flex items-center gap-1 w-5 h-5 justify-center">
                      <span className="w-1.5 h-4 bg-white rounded-xs"></span>
                      <span className="w-1.5 h-4 bg-white rounded-xs"></span>
                    </div>
                  ) : (
                    <div className="w-0 h-0 border-y-[6px] border-y-transparent border-l-[12px] border-l-white ml-0.5"></div>
                  )}
                </button>

                {/* Speaker Volume Button & YouTube Slider */}
                <div className="flex items-center group/vol">
                  <button
                    onClick={toggleMute}
                    className="cursor-pointer text-white hover:text-[#E62719] p-1 flex-shrink-0 transition"
                    title={isMuted || volume === 0 ? 'Unmute (m)' : 'Mute (m)'}
                  >
                    {isMuted || volume === 0 ? (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                        <line x1="23" y1="9" x2="17" y2="15"></line>
                        <line x1="17" y1="9" x2="23" y2="15"></line>
                      </svg>
                    ) : volume < 50 ? (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                        <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                      </svg>
                    ) : (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                        <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                      </svg>
                    )}
                  </button>

                  {/* YouTube-style smooth volume slider */}
                  <div className="w-16 sm:w-20 flex items-center ml-1">
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={isMuted ? 0 : volume}
                      onChange={handleVolumeChange}
                      className="w-full h-1 bg-white/30 rounded-lg appearance-none cursor-pointer accent-[#E62719] hover:h-1.5 transition-all"
                      title={`Volume: ${isMuted ? 0 : volume}%`}
                    />
                  </div>
                </div>

                {/* Time: 0:42 / 3:15 */}
                <span className="text-xs sm:text-sm font-bold text-white/90 font-mono flex-shrink-0 min-w-[70px]">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>

                {/* Progress / Scrubber Bar */}
                <div className="relative flex-1 flex items-center">
                  {isParticipant ? (
                    <div
                      onClick={() => {
                        setTargetSeekTime(Math.round(currentTime));
                        setIsSeekModalOpen(true);
                      }}
                      className="w-full h-1.5 bg-white/20 rounded-full relative cursor-pointer group py-1 flex items-center"
                      title="Click to request seek"
                    >
                      <div
                        className="h-1.5 bg-[#E62719] rounded-full relative"
                        style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
                      >
                        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-[#E62719] rounded-full shadow-md"></div>
                      </div>
                    </div>
                  ) : (
                    <input
                      type="range"
                      min={0}
                      max={duration || 100}
                      step={0.1}
                      value={currentTime}
                      onMouseDown={() => setIsScrubbing(true)}
                      onTouchStart={() => setIsScrubbing(true)}
                      onChange={handleSeekChange}
                      onMouseUp={handleSeekCommit}
                      onTouchEnd={handleSeekCommit}
                      className="w-full h-1.5 bg-white/25 rounded-lg appearance-none cursor-pointer accent-[#E62719]"
                    />
                  )}
                </div>

                {/* Settings Gear & Dropdown Menu */}
                <div className="relative" ref={settingsMenuRef}>
                  <button
                    onClick={() => {
                      setIsSettingsOpen(!isSettingsOpen);
                      setSettingsSubmenu('main');
                    }}
                    className={`p-1 transition cursor-pointer flex-shrink-0 ${
                      isSettingsOpen ? 'text-[#E62719] rotate-45' : 'text-white/80 hover:text-white'
                    }`}
                    title="Settings"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="3"></circle>
                      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                    </svg>
                  </button>

                  {isSettingsOpen && (
                    <div className="absolute bottom-9 right-0 w-48 sm:w-56 bg-[#18181B]/95 backdrop-blur-md border border-white/15 rounded-xl shadow-2xl p-2 text-white z-50 animate-in fade-in zoom-in-95 font-outfit text-sm">
                      {settingsSubmenu === 'main' && (
                        <div className="flex flex-col gap-1">
                          <div className="px-2.5 py-1 text-xs font-bold text-white/50 border-b border-white/10 uppercase tracking-wider mb-1">
                            Playback Settings
                          </div>
                          <button
                            onClick={() => setSettingsSubmenu('speed')}
                            className="flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-white/10 transition cursor-pointer text-left w-full"
                          >
                            <span className="flex items-center gap-2">
                              <span>⚡</span> Speed
                            </span>
                            <span className="text-white/60 flex items-center gap-1 text-xs font-bold">
                              {playbackSpeed === 1 ? 'Normal' : `${playbackSpeed}x`} &gt;
                            </span>
                          </button>
                          <button
                            onClick={openQualitySubmenu}
                            className="flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-white/10 transition cursor-pointer text-left w-full"
                          >
                            <span className="flex items-center gap-2">
                              <span>HD</span> Quality
                            </span>
                            <span className="text-white/60 flex items-center gap-1 text-xs font-bold">
                              {videoQuality} &gt;
                            </span>
                          </button>
                        </div>
                      )}

                      {settingsSubmenu === 'speed' && (
                        <div className="flex flex-col gap-1 max-h-56 overflow-y-auto">
                          <button
                            onClick={() => setSettingsSubmenu('main')}
                            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold text-[#E62719] hover:text-white transition cursor-pointer border-b border-white/10 mb-1"
                          >
                            <span>&larr;</span> Back
                          </button>
                          {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((s) => (
                            <button
                              key={s}
                              onClick={() => handleSelectSpeed(s)}
                              className={`flex items-center justify-between px-2.5 py-1 rounded-lg text-left text-xs transition cursor-pointer ${
                                playbackSpeed === s ? 'bg-[#E62719] text-white font-bold' : 'hover:bg-white/10 text-white/90'
                              }`}
                            >
                              <span>{s === 1 ? 'Normal' : `${s}x`}</span>
                              {playbackSpeed === s && <span>✓</span>}
                            </button>
                          ))}
                        </div>
                      )}

                      {settingsSubmenu === 'quality' && (
                        <div className="flex flex-col gap-1 max-h-56 overflow-y-auto">
                          <button
                            onClick={() => setSettingsSubmenu('main')}
                            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold text-[#E62719] hover:text-white transition cursor-pointer border-b border-white/10 mb-1"
                          >
                            <span>&larr;</span> Back
                          </button>
                          {availableQualities.map((q) => (
                            <button
                              key={q}
                              onClick={() => handleSelectQuality(q)}
                              className={`flex items-center justify-between px-2.5 py-1 rounded-lg text-left text-xs transition cursor-pointer ${
                                videoQuality === q ? 'bg-[#E62719] text-white font-bold' : 'hover:bg-white/10 text-white/90'
                              }`}
                            >
                              <span>{q}</span>
                              {videoQuality === q && <span>✓</span>}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Miniplayer Toggle Button */}
                <button
                  onClick={toggleMiniplayer}
                  className={`p-1 transition cursor-pointer flex-shrink-0 ${
                    isMiniplayer ? 'text-[#E62719]' : 'text-white/80 hover:text-white'
                  }`}
                  title={isMiniplayer ? 'Restore to full player (i)' : 'Miniplayer (i)'}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="4" width="20" height="16" rx="2"></rect>
                    <rect x="12" y="10" width="8" height="6" rx="1" fill="currentColor"></rect>
                  </svg>
                </button>

                {/* Theater Mode Button (Wide View vs Zoom Out to Normal) */}
                <button
                  onClick={toggleTheaterMode}
                  className={`p-1 transition cursor-pointer flex-shrink-0 ${
                    isTheaterMode ? 'text-[#E62719]' : 'text-white/80 hover:text-white'
                  }`}
                  title={isTheaterMode ? 'Zoom out to Default View (t)' : 'Theater mode (t)'}
                >
                  {isTheaterMode ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="4" width="13" height="16" rx="2"></rect>
                      <rect x="17" y="4" width="5" height="16" rx="1" strokeDasharray="2 2"></rect>
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="4" width="20" height="16" rx="2"></rect>
                    </svg>
                  )}
                </button>

                {/* Fullscreen / Zoom-Out Button */}
                <button
                  onClick={toggleFullscreen}
                  className="text-white/80 hover:text-white p-1 transition cursor-pointer flex-shrink-0"
                  title={isFullscreen ? 'Zoom out / Exit full screen (f)' : 'Full screen (f)'}
                >
                  {isFullscreen ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"></path>
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Miniplayer Placeholder in Main Layout */}
            {isMiniplayer && (
              <div className="flex-1 w-full bg-white/50 backdrop-blur-sm rounded-2xl border-2 border-dashed border-[#1A1614]/20 flex flex-col items-center justify-center p-6 text-center select-none shadow-sm">
                <div className="w-12 h-12 rounded-full bg-[#E62719]/10 flex items-center justify-center mb-2">
                  <span className="text-2xl">📺</span>
                </div>
                <p className="font-mouse text-2xl sm:text-3xl text-[#1A1614] font-bold">Video playing in Miniplayer</p>
                <p className="text-xs sm:text-sm text-[#8C8273] font-outfit mt-0.5">
                  You can browse participants and chat while watching in the floating player
                </p>
                <button
                  onClick={() => setIsMiniplayer(false)}
                  className="mt-3 bg-[#E62719] hover:bg-[#D41E11] text-white px-5 py-2 rounded-full font-mouse font-bold text-lg cursor-pointer transition shadow-md"
                >
                  Restore to main view
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT COLUMN (Sidebar: Tabs & Requests) ── */}
        <div className={`${isTheaterMode ? 'hidden' : 'lg:col-span-4 flex'} flex flex-col justify-between h-full min-h-0 gap-2 transition-all duration-300`}>
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
                        ) : (
                          <span className="border border-[#D6CBBB] bg-[#FAF7F0] text-[#554C40] font-bold text-[11px] sm:text-xs px-2.5 py-0.5 sm:py-1 rounded-full uppercase">
                            PARTICIPANT
                          </span>
                        )}

                        {isHost && !isUserHost && !isMe && (
                          <button
                            data-menu-trigger={p.userId}
                            onClick={() => setOpenMenuUserId(openMenuUserId === p.userId ? null : p.userId)}
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

                        {openMenuUserId === p.userId && (
                          <div
                            ref={menuContainerRef}
                            className="absolute right-0 top-7 z-50 bg-white rounded-xl shadow-lg p-1.5 min-w-[140px] flex flex-col gap-1 border border-[#E0D8CB]"
                          >
                            {isHost && !isMe && (
                              <>
                                <button
                                  onClick={() => {
                                    const newRole = isUserMod ? 'participant' : 'moderator';
                                    if (socket) {
                                      socket.emit('assign_role', { roomCode, userId: p.userId, role: newRole });
                                    }
                                    setOpenMenuUserId(null);
                                    showToast(`Updated ${p.username} to ${newRole}!`, 'success');
                                  }}
                                  className="text-left px-2 py-1 text-xs font-bold hover:bg-[#F4EBD9] rounded-lg text-[#1A1614] cursor-pointer"
                                >
                                  {isUserMod ? 'Make Participant' : 'Make Moderator'}
                                </button>
                                <button
                                  onClick={() => {
                                    if (socket) {
                                      socket.emit('assign_role', { roomCode, userId: p.userId, role: 'host' });
                                    }
                                    setOpenMenuUserId(null);
                                    showToast(`Transferred host to ${p.username}!`, 'success');
                                  }}
                                  className="text-left px-2 py-1 text-xs font-bold hover:bg-[#F4EBD9] rounded-lg text-[#1A1614] cursor-pointer"
                                >
                                  Transfer Host 👑
                                </button>
                                <button
                                  onClick={() => {
                                    if (socket) {
                                      socket.emit('remove_participant', { roomCode, userId: p.userId });
                                    }
                                    setOpenMenuUserId(null);
                                    showToast(`Removed ${p.username}`, 'info');
                                  }}
                                  className="text-left px-2 py-1 text-xs font-bold hover:bg-red-50 text-red-600 rounded-lg cursor-pointer"
                                >
                                  Kick User
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
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
