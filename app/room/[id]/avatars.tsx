import React from 'react';

export function AvatarKaushik({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="rounded-full flex-shrink-0">
      {/* Background circle */}
      <circle cx="50" cy="50" r="48" fill="#FCE9C8" stroke="#1A1614" strokeWidth="4" />
      {/* Shirt */}
      <path d="M 25,95 Q 50,75 75,95" fill="#E67E22" stroke="#1A1614" strokeWidth="3.5" />
      {/* Neck */}
      <rect x="44" y="65" width="12" height="15" fill="#DEAB82" stroke="#1A1614" strokeWidth="3" />
      {/* Face */}
      <ellipse cx="50" cy="52" rx="28" ry="26" fill="#F3BF95" stroke="#1A1614" strokeWidth="3.5" />
      {/* Ears */}
      <circle cx="22" cy="53" r="6" fill="#F3BF95" stroke="#1A1614" strokeWidth="3" />
      <circle cx="78" cy="53" r="6" fill="#F3BF95" stroke="#1A1614" strokeWidth="3" />
      {/* Fluffy anime black hair */}
      <path
        d="M 22,46 C 16,34 26,18 42,16 C 54,14 68,17 76,26 C 84,35 84,46 80,52 C 78,44 74,40 70,42 C 65,36 58,35 52,40 C 47,35 40,36 36,42 C 32,38 27,40 25,48 Z"
        fill="#231F20"
        stroke="#1A1614"
        strokeWidth="3.5"
      />
      {/* Hair bangs */}
      <path d="M 33,40 Q 40,48 46,41 Q 54,49 64,41 Q 69,45 74,40" fill="#231F20" />
      {/* Eyes */}
      <circle cx="39" cy="52" r="4.5" fill="#1A1614" />
      <circle cx="41" cy="50" r="1.5" fill="#FFFFFF" />
      <circle cx="61" cy="52" r="4.5" fill="#1A1614" />
      <circle cx="63" cy="50" r="1.5" fill="#FFFFFF" />
      {/* Eyebrows */}
      <path d="M 34,45 Q 39,42 44,45" stroke="#1A1614" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M 56,45 Q 61,42 66,45" stroke="#1A1614" strokeWidth="2.5" strokeLinecap="round" />
      {/* Blush */}
      <ellipse cx="33" cy="58" rx="4" ry="2.5" fill="#F49090" opacity="0.6" />
      <ellipse cx="67" cy="58" rx="4" ry="2.5" fill="#F49090" opacity="0.6" />
      {/* Big happy smile */}
      <path d="M 44,61 Q 50,68 56,61" stroke="#1A1614" strokeWidth="3" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export function AvatarAsha({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="rounded-full flex-shrink-0">
      <circle cx="50" cy="50" r="48" fill="#DDF4FF" stroke="#1A1614" strokeWidth="4" />
      {/* Shirt */}
      <path d="M 25,95 Q 50,78 75,95" fill="#3B82F6" stroke="#1A1614" strokeWidth="3.5" />
      {/* Long hair back */}
      <path d="M 22,45 C 16,65 20,85 28,92 L 72,92 C 80,85 84,65 78,45 Z" fill="#4B382A" stroke="#1A1614" strokeWidth="3.5" />
      {/* Neck */}
      <rect x="44" y="65" width="12" height="15" fill="#DEAB82" stroke="#1A1614" strokeWidth="3" />
      {/* Face */}
      <ellipse cx="50" cy="52" rx="26" ry="25" fill="#F6C8A5" stroke="#1A1614" strokeWidth="3.5" />
      {/* Hair front with straight bangs */}
      <path
        d="M 24,46 C 24,28 35,18 50,18 C 65,18 76,28 76,46 C 72,38 68,36 60,37 C 54,37 46,37 40,37 C 32,36 28,39 24,46 Z"
        fill="#4B382A"
        stroke="#1A1614"
        strokeWidth="3.5"
      />
      {/* Straight bangs */}
      <path d="M 28,37 L 72,37 L 72,43 C 68,46 62,45 56,46 C 50,45 44,46 38,45 C 33,46 29,43 28,43 Z" fill="#4B382A" />
      {/* Cute eyes */}
      <path d="M 36,52 Q 41,47 46,52" stroke="#1A1614" strokeWidth="3.5" strokeLinecap="round" fill="none" />
      <path d="M 54,52 Q 59,47 64,52" stroke="#1A1614" strokeWidth="3.5" strokeLinecap="round" fill="none" />
      {/* Blush */}
      <ellipse cx="34" cy="58" rx="4" ry="2" fill="#F49090" opacity="0.6" />
      <ellipse cx="66" cy="58" rx="4" ry="2" fill="#F49090" opacity="0.6" />
      {/* Smile */}
      <path d="M 46,62 Q 50,67 54,62" stroke="#1A1614" strokeWidth="2.5" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export function AvatarRavi({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="rounded-full flex-shrink-0">
      <circle cx="50" cy="50" r="48" fill="#E8F8EA" stroke="#1A1614" strokeWidth="4" />
      {/* Shirt */}
      <path d="M 25,95 Q 50,78 75,95" fill="#10B981" stroke="#1A1614" strokeWidth="3.5" />
      {/* Neck */}
      <rect x="44" y="65" width="12" height="15" fill="#A86F44" stroke="#1A1614" strokeWidth="3" />
      {/* Face (warmer darker skin) */}
      <ellipse cx="50" cy="52" rx="27" ry="25" fill="#BF8554" stroke="#1A1614" strokeWidth="3.5" />
      {/* Ears */}
      <circle cx="23" cy="53" r="5.5" fill="#BF8554" stroke="#1A1614" strokeWidth="3" />
      <circle cx="77" cy="53" r="5.5" fill="#BF8554" stroke="#1A1614" strokeWidth="3" />
      {/* Curly dark hair */}
      <path
        d="M 24,46 C 20,38 23,28 32,23 C 38,18 45,17 50,17 C 56,17 64,19 69,23 C 78,28 81,38 77,46 C 75,40 70,36 65,38 C 60,34 52,34 48,37 C 43,34 36,35 32,38 C 28,36 24,40 24,46 Z"
        fill="#1E1917"
        stroke="#1A1614"
        strokeWidth="3.5"
      />
      {/* Curls */}
      <circle cx="34" cy="27" r="6" fill="#1E1917" />
      <circle cx="45" cy="22" r="7" fill="#1E1917" />
      <circle cx="57" cy="22" r="7" fill="#1E1917" />
      <circle cx="67" cy="27" r="6" fill="#1E1917" />
      {/* Eyes */}
      <circle cx="39" cy="51" r="4.5" fill="#1A1614" />
      <circle cx="40.5" cy="49.5" r="1.5" fill="#FFFFFF" />
      <circle cx="61" cy="51" r="4.5" fill="#1A1614" />
      <circle cx="62.5" cy="49.5" r="1.5" fill="#FFFFFF" />
      {/* Eyebrows */}
      <path d="M 34,44 Q 39,41 44,44" stroke="#1A1614" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M 56,44 Q 61,41 66,44" stroke="#1A1614" strokeWidth="2.5" strokeLinecap="round" />
      {/* Smile */}
      <path d="M 44,61 Q 50,68 56,61" stroke="#1A1614" strokeWidth="3" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export function AvatarMeera({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="rounded-full flex-shrink-0">
      <circle cx="50" cy="50" r="48" fill="#FFF0F5" stroke="#1A1614" strokeWidth="4" />
      {/* Shirt */}
      <path d="M 25,95 Q 50,78 75,95" fill="#F43F5E" stroke="#1A1614" strokeWidth="3.5" />
      {/* Bob hair back */}
      <path d="M 22,46 C 18,65 24,78 30,82 L 70,82 C 76,78 82,65 78,46 Z" fill="#2E1F1A" stroke="#1A1614" strokeWidth="3.5" />
      {/* Neck */}
      <rect x="44" y="65" width="12" height="15" fill="#DEAB82" stroke="#1A1614" strokeWidth="3" />
      {/* Face */}
      <ellipse cx="50" cy="52" rx="26" ry="25" fill="#F8CBB0" stroke="#1A1614" strokeWidth="3.5" />
      {/* Hair front parted */}
      <path
        d="M 24,46 C 24,28 35,18 50,18 C 65,18 76,28 76,46 C 73,38 67,36 58,40 C 50,44 46,38 38,38 C 30,38 26,42 24,46 Z"
        fill="#2E1F1A"
        stroke="#1A1614"
        strokeWidth="3.5"
      />
      {/* Cute eyes */}
      <circle cx="38" cy="52" r="4.5" fill="#1A1614" />
      <circle cx="39.5" cy="50.5" r="1.5" fill="#FFFFFF" />
      <circle cx="62" cy="52" r="4.5" fill="#1A1614" />
      <circle cx="63.5" cy="50.5" r="1.5" fill="#FFFFFF" />
      {/* Blush */}
      <ellipse cx="32" cy="58" rx="4" ry="2" fill="#F49090" opacity="0.6" />
      <ellipse cx="68" cy="58" rx="4" ry="2" fill="#F49090" opacity="0.6" />
      {/* Sweet smile */}
      <path d="M 45,61 Q 50,67 55,61" stroke="#1A1614" strokeWidth="2.5" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export function UserAvatar({ name, size = 40 }: { name: string; size?: number }) {
  const lower = (name || '').toLowerCase();
  if (lower.includes('kaushik') || lower.includes('admin') || lower.includes('host')) {
    return <AvatarKaushik size={size} />;
  }
  if (lower.includes('asha') || lower.includes('mod')) {
    return <AvatarAsha size={size} />;
  }
  if (lower.includes('ravi')) {
    return <AvatarRavi size={size} />;
  }
  if (lower.includes('meera')) {
    return <AvatarMeera size={size} />;
  }

  // Deterministic avatar based on string char code
  const charSum = lower.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const mod = charSum % 4;
  if (mod === 0) return <AvatarKaushik size={size} />;
  if (mod === 1) return <AvatarAsha size={size} />;
  if (mod === 2) return <AvatarRavi size={size} />;
  return <AvatarMeera size={size} />;
}
