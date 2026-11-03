import React from 'react';

export const VoiceVisualizer: React.FC<{ isListening: boolean }> = ({ isListening }) => {
  return (
    <div className="flex items-center justify-center gap-1.5 h-12 my-2">
      {[40, 70, 30, 90, 50, 100, 60, 85, 45, 95, 35, 65].map((height, idx) => (
        <span
          key={idx}
          className={`w-1 rounded-full transition-all duration-200 ${
            isListening
              ? 'bg-gradient-to-t from-cyan-500 to-teal-300 shadow-[0_0_8px_rgba(6,182,212,0.8)]'
              : 'bg-slate-800'
          }`}
          style={{
            height: isListening ? `${height}%` : '20%',
            animation: isListening
              ? `pulseSubtle 0.8s ease-in-out infinite alternate ${idx * 0.08}s`
              : 'none',
          }}
        />
      ))}
    </div>
  );
};
