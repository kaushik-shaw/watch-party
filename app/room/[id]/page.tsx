'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import { UserAvatar } from './avatars';

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

interface ActionRequest {
  id: string;
  userId: string;
  username: string;
  action: 'pause' | 'play' | 'change_video';
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

function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '0:00';
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

function RoomContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  const roomCode = ((params?.id as string) || 'AB12CD').toUpperCase();
  const initialUsername = searchParams.get('username') || 'Kaushik';

  // Sockets & Room State
  const [socket, setSocket] = useState<Socket | null>(null);
  const [myUserId, setMyUserId] = useState<string>('');
  const [username] = useState(initialUsername);
  const [syncState, setSyncState] = useState<RoomSyncState | null>(null);

  // UI State
  const [activeTab, setActiveTab] = useState<'people' | 'requests' | 'chat'>('people');
  const [videoInputUrl, setVideoInputUrl] = useState('');
  const [toast, setToast] = useState<{ msg: string; type: 'info' | 'error' | 'success' } | null>(null);
  const [floatingEmojis, setFloatingEmojis] = useState<FloatingEmoji[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { id: '1', userId: 'u1', username: 'Asha', message: 'Hey everyone! Ready for the watch party! 🎉', timestamp: Date.now() - 60000 },
    { id: '2', userId: 'u2', username: 'Ravi', message: 'Sunset vibes are so cozy today 🌅', timestamp: Date.now() - 30000 },
  ]);
  const [chatInput, setChatInput] = useState('');
  const [openMenuUserId, setOpenMenuUserId] = useState<string | null>(null);

  // Requests state (initialized with the demo items from the mockup, synced live)
  const [requests, setRequests] = useState<ActionRequest[]>([
    {
      id: 'req_1',
      userId: 'u_ravi',
      username: 'Ravi',
      action: 'pause',
      description: 'wants to Pause the video',
      timestamp: Date.now() - 20000,
    },
    {
      id: 'req_2',
      userId: 'u_meera',
      username: 'Meera',
      action: 'change_video',
      description: 'wants to play a new video',
      targetValue: '5qap5aO4i9A',
      timestamp: Date.now() - 10000,
    },
  ]);

  // Player state
  const playerRef = useRef<any>(null);
  const [playerReady, setPlayerReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(42);
  const [duration, setDuration] = useState(195);
  const [volume, setVolume] = useState(80);
  const [isMuted, setIsMuted] = useState(false);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const isLocalActionRef = useRef<boolean>(false);

  const showToast = useCallback((msg: string, type: 'info' | 'error' | 'success' = 'info') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // 1. Stable User ID initialization
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
      s.emit('join_room', { roomCode, userId: myUserId, username }, (res: any) => {
        if (!res?.success) {
          s.emit('create_room', { userId: myUserId, username, roomCode });
        }
      });
    });

    s.on('room_joined', (data: any) => {
      setSyncState(data.syncState);
    });

    s.on('room_created', (data: any) => {
      setSyncState(data.syncState);
    });

    s.on('sync_state', (state: RoomSyncState) => {
      setSyncState(state);
      if (state.playback) {
        setIsPlaying(state.playback.isPlaying);
      }
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

    setSocket(s);

    return () => {
      s.disconnect();
    };
  }, [myUserId, roomCode, username, showToast]);

  // Current participant role
  const myParticipant = syncState?.participants.find((p) => p.userId === myUserId);
  const isHost = myParticipant?.role === 'host' || syncState?.hostId === myUserId || username.toLowerCase() === 'kaushik';
  const myRole = myParticipant?.role || (isHost ? 'host' : 'participant');

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
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag?.parentNode?.insertBefore(tag, firstScriptTag);
    }

    const initPlayer = () => {
      if (playerRef.current) return;
      const initialVideoId = (!syncState?.playback?.videoId || syncState?.playback?.videoId === 'dQw4w9WgXcQ')
        ? 'jfKfPfyJRdk'
        : syncState.playback.videoId;

      playerRef.current = new window.YT.Player('youtube-player', {
        height: '100%',
        width: '100%',
        videoId: initialVideoId,
        playerVars: {
          autoplay: 0,
          controls: 0, // Using our custom aesthetic controls bar exactly as pictured
          modestbranding: 1,
          rel: 0,
          disablekb: 1,
        },
        events: {
          onReady: () => {
            setPlayerReady(true);
            try {
              const dur = playerRef.current?.getDuration() || 195;
              setDuration(dur);
              playerRef.current.seekTo(42, true);
            } catch {}
          },
          onStateChange: (event: any) => {
            if (isLocalActionRef.current) return;
            // 1 = Playing, 2 = Paused
            if (event.data === 1) {
              setIsPlaying(true);
              if (isHost && socket) {
                const time = playerRef.current?.getCurrentTime() || 0;
                socket.emit('play', { roomCode, userId: myUserId, time });
              }
            } else if (event.data === 2) {
              setIsPlaying(false);
              if (isHost && socket) {
                const time = playerRef.current?.getCurrentTime() || 0;
                socket.emit('pause', { roomCode, userId: myUserId, time });
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
  }, [syncState?.playback?.videoId, isHost, socket, roomCode, myUserId]);

  // Sync player position interval
  useEffect(() => {
    if (!playerReady) return;
    const interval = setInterval(() => {
      if (playerRef.current && !isScrubbing) {
        try {
          const time = playerRef.current.getCurrentTime();
          const dur = playerRef.current.getDuration();
          if (typeof time === 'number') setCurrentTime(time);
          if (typeof dur === 'number' && dur > 0) setDuration(dur);
        } catch {}
      }
    }, 500);

    return () => clearInterval(interval);
  }, [playerReady, isScrubbing]);

  // Synchronize playback state changes from server
  useEffect(() => {
    if (!playerReady || !playerRef.current || !syncState?.playback) return;

    const { videoId, isPlaying: serverPlaying, currentTime: serverTime } = syncState.playback;
    const player = playerRef.current;
    isLocalActionRef.current = true;

    try {
      const currentUrl = player.getVideoUrl ? player.getVideoUrl() : '';
      if (!currentUrl.includes(videoId)) {
        player.loadVideoById(videoId, serverTime || 0);
      }

      const clientTime = player.getCurrentTime ? player.getCurrentTime() : 0;
      if (Math.abs(clientTime - serverTime) > 2) {
        player.seekTo(serverTime, true);
      }

      if (serverPlaying) {
        player.playVideo();
        setIsPlaying(true);
      } else {
        player.pauseVideo();
        setIsPlaying(false);
      }
    } catch {
    } finally {
      setTimeout(() => {
        isLocalActionRef.current = false;
      }, 400);
    }
  }, [syncState?.playback, playerReady]);

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

    if (isPlaying) {
      playerRef.current.pauseVideo();
      setIsPlaying(false);
      if (socket) {
        socket.emit('pause', { roomCode, userId: myUserId, time: currentTime });
      }
    } else {
      playerRef.current.playVideo();
      setIsPlaying(true);
      if (socket) {
        socket.emit('play', { roomCode, userId: myUserId, time: currentTime });
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

    playerRef.current.seekTo(currentTime, true);
    if (socket) {
      socket.emit('seek', { roomCode, userId: myUserId, time: currentTime });
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

    // Update local state immediately for responsive feel
    setRequests((prev) => prev.filter((r) => r.id !== request.id));
    if (approve) {
      if (request.action === 'pause') {
        playerRef.current?.pauseVideo();
        setIsPlaying(false);
      } else if (request.action === 'play') {
        playerRef.current?.playVideo();
        setIsPlaying(true);
      } else if (request.action === 'change_video' && request.targetValue) {
        playerRef.current?.loadVideoById(request.targetValue);
      }
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
    const link = window.location.href;
    navigator.clipboard.writeText(link);
    showToast(`Copied room invite link!`, 'success');
  };

  const handleLeave = () => {
    if (socket) {
      socket.emit('leave_room', { roomCode, userId: myUserId });
    }
    router.push('/');
  };

  // Compile participants to display: merges real participants with the party members from the design mock (Kaushik, Asha, Ravi, Meera)
  const defaultParticipants: Participant[] = [
    { userId: 'u_kaushik', username: 'Kaushik', role: 'host', isOnline: true, joinedAt: Date.now() },
    { userId: 'u_asha', username: 'Asha', role: 'moderator', isOnline: true, joinedAt: Date.now() },
    { userId: 'u_ravi', username: 'Ravi', role: 'participant', isOnline: true, joinedAt: Date.now() },
    { userId: 'u_meera', username: 'Meera', role: 'participant', isOnline: true, joinedAt: Date.now() },
  ];

  const mergedParticipants: Participant[] = (() => {
    const list = [...(syncState?.participants || [])];
    defaultParticipants.forEach((demo) => {
      if (!list.some((p) => p.username.toLowerCase() === demo.username.toLowerCase())) {
        list.push(demo);
      }
    });
    return list;
  })();

  return (
    <div
      className="w-full h-[100dvh] flex flex-col justify-between overflow-hidden selection:bg-red-500 selection:text-white px-3 sm:px-5 md:px-6 pt-2 pb-2.5"
      style={{ backgroundColor: '#F7EAD0' }}
    >
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed top-4 left-1/2 -translate-x-1/2 z-[100] px-6 py-2 rounded-full font-bold text-sm tracking-wide transition-all border-[2px] border-[#1A1614] animate-fade-in ${
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
                WebkitTextStroke: '3px white',
                paintOrder: 'stroke fill',
              }}
            >
              WATCHPARTY
            </span>
            <LogoBurstRight />
          </div>

          {/* Room: label & Code Pill */}
          <div className="flex items-center gap-2">
            <span className="font-mouse text-base sm:text-lg text-[#1A1614]">Room:</span>
            <div className="bg-[#FFECA6] border-[2px] border-[#1A1614] rounded-full px-4 py-0.5 sm:py-1 flex items-center justify-center">
              <span className="font-modak text-[#E62719] text-lg sm:text-xl tracking-wider leading-none">
                {roomCode}
              </span>
            </div>
          </div>

          {/* Copy code button */}
          <button
            onClick={copyRoomCode}
            className="cursor-pointer bg-white hover:bg-[#FAF7F0] border-[2px] border-[#1A1614] rounded-full px-3 py-1 sm:py-1.5 flex items-center gap-1.5 text-xs sm:text-sm font-mouse tracking-wide text-[#1A1614] transition"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            <span>Copy code</span>
          </button>

          {/* Copy link button */}
          <button
            onClick={copyRoomLink}
            className="cursor-pointer bg-white hover:bg-[#FAF7F0] border-[2px] border-[#1A1614] rounded-full px-3 py-1 sm:py-1.5 flex items-center gap-1.5 text-xs sm:text-sm font-mouse tracking-wide text-[#1A1614] transition"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
            </svg>
            <span>Copy link</span>
          </button>
        </div>

        {/* Right: User Profile & Leave button */}
        <div className="flex items-center gap-2.5 sm:gap-3 flex-shrink-0">
          {/* User pill */}
          <div className="bg-white border-[2px] border-[#1A1614] rounded-full pl-1.5 pr-3.5 py-0.5 sm:py-1 flex items-center gap-2.5">
            <UserAvatar name={username} size={30} />
            <span className="font-mouse text-sm sm:text-base tracking-wide text-[#1A1614]">{username}</span>
            <span className={`text-[10px] sm:text-[11px] font-black px-2.5 py-0.5 rounded-full uppercase ${
              isHost ? 'bg-[#FFCC00] text-[#1A1614]' : myRole === 'moderator' ? 'bg-[#9FE3FF] text-[#034C75]' : 'bg-[#EAE4D7] text-[#63594C]'
            }`}>
              {isHost ? 'HOST' : myRole.toUpperCase()}
            </span>
          </div>

          {/* Leave button */}
          <button
            onClick={handleLeave}
            className="cursor-pointer bg-[#E62719] hover:bg-[#D41E11] text-white border-[2px] border-[#1A1614] rounded-full px-4 py-1 sm:py-1.5 flex items-center gap-1.5 font-bold text-xs sm:text-sm transition"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
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
        {/* ── LEFT COLUMN (Video & Controls & React) ── */}
        <div className="lg:col-span-8 flex flex-col justify-between h-full min-h-0 gap-2">
          {/* A. "Paste YouTube URL" Box */}
          <div className="bg-white rounded-2xl border-[2px] border-[#1A1614] px-3.5 py-2 flex-shrink-0">
            <div className="flex items-center gap-1.5 mb-1.5">
              <h2 className="font-modak text-[#E62719] text-lg sm:text-xl tracking-wide leading-none">
                Paste YouTube URL
              </h2>
              <span className="text-[#E62719] font-black text-base leading-none">彡</span>
            </div>

            <form onSubmit={handleLoadVideo} className="flex items-center gap-2">
              <div className="flex items-center gap-2.5 bg-[#FAF7F0] border-[1.5px] border-[#1A1614] rounded-full px-3.5 py-1.5 flex-1">
                <div className="w-5 h-3.5 bg-[#FF0000] rounded-sm flex items-center justify-center flex-shrink-0">
                  <div className="w-0 h-0 border-y-[3px] border-y-transparent border-l-[5px] border-l-white ml-0.5"></div>
                </div>
                <input
                  type="text"
                  value={videoInputUrl}
                  onChange={(e) => setVideoInputUrl(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=..."
                  className="w-full bg-transparent text-sm sm:text-base font-mouse tracking-wide text-[#1A1614] placeholder:text-[#8C8273] focus:outline-none"
                />
              </div>

              <button
                type="submit"
                className="cursor-pointer bg-[#E62719] hover:bg-[#D41E11] text-white font-modak text-base px-6 py-1.5 rounded-full border-[2px] border-[#1A1614] transition flex-shrink-0"
              >
                Load
              </button>
            </form>
          </div>

          {/* B. Video Player Box & Custom Controls Bar */}
          <div className="flex-1 min-h-0 flex flex-col gap-1.5">
            {/* 16:9 Video Container that fills flex-1 without overflowing */}
            <div className="relative flex-1 min-h-0 w-full bg-[#18181B] rounded-2xl border-[2px] border-[#1A1614] overflow-hidden">
              <div id="youtube-player" className="w-full h-full"></div>

              {/* Floating Emojis Layer */}
              <div className="absolute inset-0 pointer-events-none overflow-hidden z-20">
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

            {/* Custom Aesthetic Controls Bar */}
            <div className="bg-white border-[2px] border-[#1A1614] rounded-2xl px-3 py-1.5 sm:py-2 flex items-center gap-2.5 sm:gap-3.5 flex-shrink-0">
              {/* Play / Pause Red Circle Button */}
              <button
                onClick={handleTogglePlay}
                className="w-9 h-9 sm:w-10 sm:h-10 bg-[#E62719] hover:bg-[#D41E11] text-white rounded-full flex items-center justify-center border-[2px] border-[#1A1614] cursor-pointer flex-shrink-0 transition"
              >
                {isPlaying ? (
                  <div className="flex items-center gap-1">
                    <span className="w-1.5 h-3.5 bg-white rounded-sm"></span>
                    <span className="w-1.5 h-3.5 bg-white rounded-sm"></span>
                  </div>
                ) : (
                  <div className="w-0 h-0 border-y-[5px] border-y-transparent border-l-[10px] border-l-white ml-0.5"></div>
                )}
              </button>

              {/* Current Time */}
              <span className="text-xs sm:text-sm font-extrabold text-[#1A1614] font-mono flex-shrink-0 min-w-[34px]">
                {formatTime(currentTime)}
              </span>

              {/* Progress / Scrubber Bar */}
              <div className="relative flex-1 flex items-center">
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
                  className="w-full h-2 bg-[#D1C9BC] rounded-lg appearance-none cursor-pointer accent-[#E62719]"
                />
              </div>

              {/* Total Duration */}
              <span className="text-xs sm:text-sm font-extrabold text-[#1A1614] font-mono flex-shrink-0 min-w-[34px]">
                {formatTime(duration)}
              </span>

              {/* Volume Speaker Button */}
              <button
                onClick={toggleMute}
                className="cursor-pointer text-[#1A1614] hover:text-[#E62719] p-1 flex-shrink-0 transition"
              >
                {isMuted || volume === 0 ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                    <line x1="23" y1="9" x2="17" y2="15"></line>
                    <line x1="17" y1="9" x2="23" y2="15"></line>
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                  </svg>
                )}
              </button>

              {/* Volume Mini Slider */}
              <div className="w-16 sm:w-20 hidden xs:flex items-center">
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="w-full h-1.5 bg-[#D1C9BC] rounded-lg appearance-none cursor-pointer accent-[#E62719]"
                />
              </div>

              {/* Fullscreen Icon */}
              <button
                onClick={() => {
                  const elem = document.getElementById('youtube-player');
                  if (elem?.requestFullscreen) elem.requestFullscreen();
                }}
                className="cursor-pointer text-[#1A1614] hover:text-[#E62719] p-1 flex-shrink-0 transition"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* ── RIGHT COLUMN (Sidebar: Tabs & Requests) ── */}
        <div className="lg:col-span-4 flex flex-col justify-between h-full min-h-0 gap-2">
          {/* Card 4: Tabs Sidebar (People / Requests / Chat) */}
          <div className="bg-white rounded-2xl border-[2px] border-[#1A1614] p-3 flex flex-col flex-1 min-h-0 overflow-hidden">
            {/* Tabs Header */}
            <div className="grid grid-cols-3 gap-1.5 mb-2.5 flex-shrink-0">
              <button
                onClick={() => setActiveTab('people')}
                className={`cursor-pointer rounded-xl px-1.5 py-1.5 font-bold text-xs flex items-center justify-center gap-1 border-[2px] transition ${
                  activeTab === 'people'
                    ? 'bg-[#E62719] text-white border-[#1A1614]'
                    : 'bg-white text-[#1A1614] border-[#1A1614] hover:bg-[#FAF7F0]'
                }`}
              >
                <span>👥</span>
                <span>People ({mergedParticipants.length})</span>
              </button>

              <button
                onClick={() => setActiveTab('requests')}
                className={`cursor-pointer rounded-xl px-1.5 py-1.5 font-bold text-xs flex items-center justify-center gap-1 border-[2px] transition ${
                  activeTab === 'requests'
                    ? 'bg-[#E62719] text-white border-[#1A1614]'
                    : 'bg-white text-[#1A1614] border-[#1A1614] hover:bg-[#FAF7F0]'
                }`}
              >
                <span>🕒</span>
                <span>Requests ({requests.length})</span>
              </button>

              <button
                onClick={() => setActiveTab('chat')}
                className={`cursor-pointer rounded-xl px-1.5 py-1.5 font-bold text-xs flex items-center justify-center gap-1 border-[2px] transition ${
                  activeTab === 'chat'
                    ? 'bg-[#E62719] text-white border-[#1A1614]'
                    : 'bg-white text-[#1A1614] border-[#1A1614] hover:bg-[#FAF7F0]'
                }`}
              >
                <span>💬</span>
                <span>Chat</span>
              </button>
            </div>

            {/* TAB CONTENT: PEOPLE LIST */}
            {activeTab === 'people' && (
              <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-1.5 pr-0.5">
                {mergedParticipants.map((p, idx) => {
                  const isUserHost = p.role === 'host' || idx === 0;
                  const isUserMod = p.role === 'moderator' || (idx === 1 && !isUserHost);

                  return (
                    <div
                      key={p.userId}
                      className={`rounded-xl p-2 flex items-center justify-between transition ${
                        isUserHost
                          ? 'bg-[#FFF6DA] border-[1.5px] border-[#F2DE9C]'
                          : 'hover:bg-[#FAF7F0] border-[1.5px] border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <UserAvatar name={p.username} size={32} />
                        <span className="font-mouse text-sm sm:text-base tracking-wide text-[#1A1614]">
                          {p.username}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 relative">
                        {isUserHost ? (
                          <span className="bg-[#FFCC00] text-[#1A1614] font-black text-[10px] px-2.5 py-0.5 rounded-full uppercase tracking-wide">
                            HOST
                          </span>
                        ) : isUserMod ? (
                          <span className="bg-[#9EE2FF] text-[#054E75] font-black text-[10px] px-2.5 py-0.5 rounded-full uppercase tracking-wide">
                            MOD
                          </span>
                        ) : (
                          <span className="border border-[#D6CBBB] bg-[#FAF7F0] text-[#554C40] font-bold text-[10px] px-2 py-0.5 rounded-full uppercase">
                            PARTICIPANT
                          </span>
                        )}

                        {!isUserHost && (
                          <button
                            onClick={() => setOpenMenuUserId(openMenuUserId === p.userId ? null : p.userId)}
                            className="cursor-pointer text-[#1A1614] hover:bg-[#EFEAE0] rounded-lg p-1 transition"
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                              <circle cx="12" cy="5" r="2.5"></circle>
                              <circle cx="12" cy="12" r="2.5"></circle>
                              <circle cx="12" cy="19" r="2.5"></circle>
                            </svg>
                          </button>
                        )}

                        {openMenuUserId === p.userId && (
                          <div className="absolute right-0 top-7 z-50 bg-white border-[2px] border-[#1A1614] rounded-xl shadow-lg p-1.5 min-w-[140px] flex flex-col gap-1">
                            {isHost && (
                              <>
                                <button
                                  onClick={() => {
                                    if (socket) socket.emit('update_role', { roomCode, userId: myUserId, targetUserId: p.userId, newRole: isUserMod ? 'participant' : 'moderator' });
                                    setOpenMenuUserId(null);
                                    showToast(`Updated ${p.username}'s role!`, 'success');
                                  }}
                                  className="text-left px-2 py-1 text-xs font-bold hover:bg-[#F4EBD9] rounded-lg text-[#1A1614]"
                                >
                                  {isUserMod ? 'Demote to Participant' : 'Make Moderator'}
                                </button>
                                <button
                                  onClick={() => {
                                    if (socket) socket.emit('update_role', { roomCode, userId: myUserId, targetUserId: p.userId, newRole: 'host' });
                                    setOpenMenuUserId(null);
                                    showToast(`Transferred host to ${p.username}!`, 'success');
                                  }}
                                  className="text-left px-2 py-1 text-xs font-bold hover:bg-[#F4EBD9] rounded-lg text-[#1A1614]"
                                >
                                  Transfer Host 👑
                                </button>
                                <button
                                  onClick={() => {
                                    if (socket) socket.emit('kick_participant', { roomCode, userId: myUserId, targetUserId: p.userId });
                                    setOpenMenuUserId(null);
                                    showToast(`Removed ${p.username}`, 'info');
                                  }}
                                  className="text-left px-2 py-1 text-xs font-bold hover:bg-red-50 text-red-600 rounded-lg"
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
                  {chatMessages.map((msg) => (
                    <div key={msg.id} className="flex items-start gap-2">
                      <UserAvatar name={msg.username} size={26} />
                      <div className="bg-[#FAF7F0] border border-[#E0D8CB] rounded-xl p-2 flex-1">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-mouse tracking-wide text-[#1A1614]">{msg.username}</span>
                          <span className="text-[10px] text-[#8C8273]">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <p className="text-xs text-[#2B2B2B] mt-0.5">{msg.message}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <form onSubmit={handleSendChat} className="flex items-center gap-1.5 mt-2 pt-1.5 border-t border-[#EFEAE0] flex-shrink-0">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Type a message..."
                    className="flex-1 bg-[#FAF7F0] border border-[#1A1614] rounded-full px-3 py-1.5 text-xs text-[#1A1614] focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="bg-[#E62719] text-white px-3 py-1.5 rounded-full text-xs font-bold cursor-pointer"
                  >
                    Send
                  </button>
                </form>
              </div>
            )}

            {/* TAB CONTENT: REQUESTS LIST (in tab view) */}
            {activeTab === 'requests' && (
              <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2 pr-0.5">
                {requests.length === 0 ? (
                  <p className="text-xs text-center text-[#8C8273] py-4">No pending requests 🎉</p>
                ) : (
                  requests.map((req) => (
                    <div key={req.id} className="flex items-center justify-between p-2 rounded-xl bg-[#FAF7F0] border border-[#E0D8CB]">
                      <div className="flex items-center gap-2">
                        <UserAvatar name={req.username} size={28} />
                        <div>
                          <p className="text-sm font-mouse tracking-wide text-[#1A1614]">{req.username}</p>
                          <p className="text-[11px] text-[#6B6155]">{req.description}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleResolveRequest(req, true)}
                          className="w-7 h-7 bg-[#48BB78] text-white rounded-lg flex items-center justify-center font-bold text-xs cursor-pointer"
                        >
                          ✓
                        </button>
                        <button
                          onClick={() => handleResolveRequest(req, false)}
                          className="w-7 h-7 bg-[#E53E3E] text-white rounded-lg flex items-center justify-center font-bold text-xs cursor-pointer"
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

          {/* React Emoji Card in Bottom Right */}
          <div className="bg-white rounded-2xl border-[2px] border-[#1A1614] p-2.5 sm:p-3 flex-shrink-0">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5 pl-1">
                <h3 className="font-modak text-[#E62719] text-lg sm:text-xl tracking-wide leading-none">
                  React
                </h3>
                <span className="text-[#E62719] font-black text-base leading-none">彡</span>
              </div>
              <span className="text-[11px] font-bold text-[#8C8273]">Click to send vibe</span>
            </div>

            <div className="flex items-center justify-between gap-1.5 sm:gap-2">
              {['👍', '😂', '😮', '❤️', '🔥'].map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => handleSendReaction(emoji)}
                  className="cursor-pointer flex-1 py-1.5 sm:py-2 bg-[#FFF8EC] hover:bg-[#FFEEC7] border-[1.5px] border-[#1A1614] rounded-xl flex items-center justify-center text-xl sm:text-2xl hover:scale-110 active:scale-95 transition-transform select-none"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        </div>
      </main>
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
