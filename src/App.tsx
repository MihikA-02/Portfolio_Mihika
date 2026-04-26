/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Canvas, useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { EffectComposer, Bloom, DepthOfField } from '@react-three/postprocessing';
import * as THREE from 'three';
import React, { useRef, useMemo, useEffect, createContext, useContext, useState } from 'react';
import { motion } from 'motion/react';

// --- CONFIGURATION ---
const RADIUS = 3.5;
const LENGTH = 70;
const TURNS = 8.5;
const STRAND_POINTS = 8000;
const RUNG_COUNTS = 400;
const PARTICLES_PER_RUNG = 25;
const DUST_COUNT = 1500;

interface ParticleData {
  x: number;
  y: number;
  z: number;
  color: THREE.Color;
  isDust: boolean;
  speed?: number;
  textX?: number;
  textY?: number;
  textZ?: number;
  depthOffset?: number;
  isTextMain?: boolean;
}

function generateDNA(scaleFactor: number, isMobile: boolean) {
  const radius = RADIUS * scaleFactor;
  const strandPoints = isMobile ? 4000 : STRAND_POINTS;
  const rungCounts = isMobile ? 200 : RUNG_COUNTS;
  const dustCount = isMobile ? 800 : DUST_COUNT;

  const points: ParticleData[] = [];
  const colorCyan = new THREE.Color(0x00f3ff);
  const colorMagenta = new THREE.Color(0xff0055);

  // Generate text points
  const textPoints: {x: number, y: number}[] = [];
  try {
    const canvas = document.createElement('canvas');
    const cw = isMobile ? 1024 : 1536;
    const ch = 512;
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, cw, ch);
      
      // MIHIKA
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = isMobile ? 'bold 100px Arial, sans-serif' : 'bold 150px Arial, sans-serif';
      ctx.fillText('MIHIKA', cw / 2, ch / 2);

      const imgData = ctx.getImageData(0, 0, cw, ch).data;
      // sample density
      const step = isMobile ? 4 : 2;
      for (let y = 0; y < ch; y += step) {
        for (let x = 0; x < cw; x += step) {
          const idx = (y * cw + x) * 4;
          if (imgData[idx] > 128) {
            // Coordinate mapping: 
            // Map text onto the XZ plane at Y=0 so camera at [0,-8,0] sees it flat
            const px = -(x - cw/2) / cw * (isMobile ? 10 : 14); // Inverted X to fix mirror effect
            const py = (y - ch/2) / ch * 4.6; 
            textPoints.push({ x: px, y: py });
          }
        }
      }
    }
  } catch (e) {
    console.error("Canvas text generation failed", e);
  }

  // Shuffle text points so we assign them pseudo-randomly to DNA points
  for (let i = textPoints.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [textPoints[i], textPoints[j]] = [textPoints[j], textPoints[i]];
  }

  let textIdx = 0;
  function getNextTextPoint() {
    if (textIdx < textPoints.length) {
      return textPoints[textIdx++];
    }
    return null;
  }

  function assignTextData() {
    const tPt = getNextTextPoint();
    if (tPt) {
      return {
        textX: tPt.x,
        textY: tPt.y, // Canvas Y, will map to target Z
        textZ: (Math.random() - 0.5) * 0.02, // Very tight Z thickness for readable text
        depthOffset: 0, // Target Y (exact origin, avoids edge perspective tilt)
        isTextMain: true
      };
    } else {
      // Leftover particles form a background cloud natively
      return {
        textX: (Math.random() - 0.5) * 60,
        textY: (Math.random() - 0.5) * 40, 
        textZ: 0, 
        depthOffset: Math.random() * 25, // Arrayed behind text along +Y
        isTextMain: false
      };
    }
  }

  // Generate Strands
  for (let j = 0; j < 2; j++) {
    const mainColor = j === 0 ? colorCyan : colorMagenta;
    const offset = j === 0 ? 0 : Math.PI;

    for (let i = 0; i < strandPoints; i++) {
      const t = i / strandPoints;
      const scatterR = (Math.random() - 0.5) * 0.4;
      const r = radius + scatterR;
      const angle = t * Math.PI * 2 * TURNS + offset;
      
      points.push({
        x: Math.cos(angle) * r,
        y: t * LENGTH - LENGTH / 2,
        z: Math.sin(angle) * r,
        color: mainColor.clone().offsetHSL(0, 0, (Math.random() - 0.5) * 0.2),
        isDust: false,
        ...assignTextData()
      });
    }
  }

  // Generate Rungs
  for (let i = 0; i < rungCounts; i++) {
    const t = i / rungCounts;
    const angle = t * Math.PI * 2 * TURNS;
    const y = t * LENGTH - LENGTH / 2;
    
    const sx = Math.cos(angle) * radius;
    const sz = Math.sin(angle) * radius;
    const ex = Math.cos(angle + Math.PI) * radius;
    const ez = Math.sin(angle + Math.PI) * radius;

    for (let j = 0; j < PARTICLES_PER_RUNG; j++) {
      const rt = j / (PARTICLES_PER_RUNG - 1);
      
      const scatterX = (Math.random() - 0.5) * 0.2;
      const scatterY = (Math.random() - 0.5) * 0.2;
      const scatterZ = (Math.random() - 0.5) * 0.2;

      points.push({
        x: sx + (ex - sx) * rt + scatterX,
        y: y + scatterY,
        z: sz + (ez - sz) * rt + scatterZ,
        color: colorCyan.clone().lerp(colorMagenta, rt).offsetHSL(0, 0, (Math.random() - 0.5) * 0.2),
        isDust: false,
        ...assignTextData()
      });
    }
  }

  // Generate Ambient Dust
  for (let i = 0; i < dustCount; i++) {
    points.push({
      x: (Math.random() - 0.5) * 20,
      y: (Math.random() - 0.5) * LENGTH,
      z: (Math.random() - 0.5) * 20,
      color: new THREE.Color(0x333355).lerp(new THREE.Color(0x444466), Math.random()),
      isDust: true,
      speed: Math.random() * 0.015,
      ...assignTextData()
    });
  }

  return points;
}

export const SceneContext = createContext<any>(null);

// ─── Project Card variants ────────────────────────────────────────────────

/** Standard clickable project card with external link */
const ProjectCard = ({
  number, title, desc, cta, href, side
}: {
  number: string, title: string, desc: string, cta: string,
  href: string, side: "left" | "right"
}) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    className={`group flex flex-col w-[280px] sm:w-[300px] md:w-[360px] rounded-2xl
      bg-black/60 border border-cyan-500/40
      backdrop-blur-md
      shadow-[0_0_20px_rgba(0,255,255,0.08),inset_0_0_20px_rgba(0,255,255,0.02)]
      hover:border-cyan-400/80 hover:shadow-[0_0_50px_rgba(0,255,255,0.30),inset_0_0_30px_rgba(0,255,255,0.04)]
      active:scale-95
      transition-all duration-500 ease-out hover:scale-[1.03] cursor-pointer p-8 gap-4
      ${side === 'right' ? 'items-end text-right' : 'items-start text-left'}`}
  >
    <span className="text-cyan-400/60 text-[9px] tracking-[0.4em] uppercase font-medium">{number}</span>
    <h3 className="text-2xl md:text-3xl font-semibold tracking-wide text-white
      drop-shadow-[0_0_15px_rgba(0,255,255,0.4)] leading-tight">{title}</h3>
    <p className="text-cyan-100/75 text-xs md:text-sm tracking-wider font-light leading-relaxed">{desc}</p>
    <span className="mt-2 text-[11px] tracking-[0.25em] uppercase text-cyan-400/70
      group-hover:text-cyan-200 group-hover:drop-shadow-[0_0_10px_rgba(0,255,255,0.8)]
      transition-all duration-300">{cta} &rarr;</span>
  </a>
);

/** Certifications trigger card for Project 3 */
const CertificationsCard = ({ onCerts, side }: { onCerts: () => void, side: "left" | "right" }) => (
  <div
    onClick={onCerts}
    className={`group flex flex-col w-[280px] sm:w-[300px] md:w-[360px] rounded-2xl
      bg-gradient-to-br from-indigo-950/60 to-black/60
      border border-cyan-500/40
      backdrop-blur-md shadow-[0_0_25px_rgba(0,255,255,0.08),inset_0_0_20px_rgba(0,255,255,0.02)]
      hover:border-cyan-400/80 hover:shadow-[0_0_50px_rgba(0,255,255,0.30),inset_0_0_30px_rgba(0,255,255,0.04)]
      active:scale-95
      transition-all duration-500 ease-out hover:scale-[1.03] cursor-pointer p-8 gap-4
      ${side === 'right' ? 'items-end text-right' : 'items-start text-left'}`}
  >
    <span className="text-cyan-400/60 text-[9px] tracking-[0.4em] uppercase font-medium">Credibility</span>
    <h3 className="text-2xl md:text-3xl font-semibold tracking-wide text-white
      drop-shadow-[0_0_15px_rgba(0,255,255,0.4)] leading-tight">Certifications</h3>
    <p className="text-cyan-100/75 text-xs md:text-sm tracking-wider font-light leading-relaxed">Verified skills &amp; achievement badges</p>
    <span className="mt-2 text-[11px] tracking-[0.25em] uppercase text-cyan-400/70
      group-hover:text-cyan-200 group-hover:drop-shadow-[0_0_10px_rgba(0,255,255,0.8)]
      transition-all duration-300">Click to explore &rarr;</span>
  </div>
);


/** Gallery trigger card for Project 4 */
const GalleryCard = ({ onGallery, side }: { onGallery: () => void, side: "left" | "right" }) => (
  <div
    onClick={onGallery}
    className={`group flex flex-col w-[280px] sm:w-[300px] md:w-[360px] rounded-2xl
      bg-gradient-to-br from-cyan-950/70 to-black/70
      border border-cyan-400/40
      backdrop-blur-md
      shadow-[0_0_25px_rgba(0,255,255,0.12),inset_0_0_20px_rgba(0,255,255,0.03)]
      hover:border-cyan-300/90 hover:shadow-[0_0_60px_rgba(0,255,255,0.35),inset_0_0_30px_rgba(0,255,255,0.06)]
      active:scale-95
      transition-all duration-500 ease-out hover:scale-[1.03] cursor-pointer p-8 gap-4
      ${side === 'right' ? 'items-end text-right' : 'items-start text-left'}`}
  >
    <span className="text-cyan-300/60 text-[9px] tracking-[0.4em] uppercase font-medium">Design Work</span>
    <h3 className="text-2xl md:text-3xl font-semibold tracking-wide text-cyan-200
      drop-shadow-[0_0_20px_rgba(0,255,255,0.6)] leading-tight">Designing Gallery</h3>
    <p className="text-cyan-300/70 text-xs md:text-sm tracking-wider font-light leading-relaxed">Posters, visuals &amp; graphic work</p>
    <span className="mt-2 text-[11px] tracking-[0.25em] uppercase text-cyan-300/70
      group-hover:text-cyan-100 group-hover:drop-shadow-[0_0_12px_rgba(0,255,255,1)]
      transition-all duration-300">Click to explore &rarr;</span>
  </div>
);


function getSideContentData(onGallery: () => void, onCerts: () => void) {
  return [
    {
      id: "intro",
      side: "left",
      content: (
        <div className="flex flex-col items-start intro-container">
          <h2 className="intro-line-1 text-3xl md:text-5xl font-light tracking-widest uppercase text-transparent bg-clip-text bg-gradient-to-r from-cyan-200 to-white drop-shadow-[0_0_15px_rgba(0,255,255,0.4)]">Mihika Ahirwar</h2>
          <p className="intro-line-2 text-cyan-100/80 tracking-widest uppercase text-xs md:text-sm mt-4 drop-shadow-[0_0_10px_rgba(0,255,255,0.2)]">Pursuing B.Tech in Computer Science &amp; Engineering</p>
          <p className="intro-line-3 text-cyan-200/50 tracking-wider uppercase text-[10px] md:text-xs mt-2">Madhav Institute of Technology and Science, Gwalior</p>
          <div className="intro-line-4 mt-5">
            <span className="inline-block border border-cyan-400/30 bg-cyan-500/10 text-cyan-300 tracking-widest font-medium px-4 py-1.5 text-[10px] rounded-full shadow-[0_0_10px_rgba(0,255,255,0.2)]">1ST YEAR</span>
          </div>
        </div>
      ),
      inStart: 42, inEnd: 52, outStart: 73, outEnd: 84
    },
    {
      id: "skills", side: "right",
      content: (
        <div className="flex flex-col items-start text-left gap-3">
          <h4 className="text-cyan-400/50 text-[10px] tracking-[0.3em] uppercase mb-1">Skills</h4>
          <p className="text-lg md:text-xl font-light tracking-widest uppercase text-cyan-50 drop-shadow-[0_0_10px_rgba(0,255,255,0.3)]">UI/UX Design • Graphics</p>
          <p className="text-lg md:text-xl font-light tracking-widest uppercase text-cyan-50 drop-shadow-[0_0_10px_rgba(0,255,255,0.3)]">Frontend • HTML • CSS</p>
          <p className="text-lg md:text-xl font-light tracking-widest uppercase text-cyan-50 drop-shadow-[0_0_10px_rgba(0,255,255,0.3)]">JavaScript • C / C++</p>
          <p className="text-lg md:text-xl font-light tracking-widest uppercase text-cyan-50 drop-shadow-[0_0_10px_rgba(0,255,255,0.3)]">Writing</p>
        </div>
      ),
      inStart: 87, inEnd: 98, outStart: 112, outEnd: 122
    },
    {
      id: "tools", side: "left",
      content: (
        <div className="flex flex-col items-end text-right gap-3">
          <h4 className="text-cyan-400/50 text-[10px] tracking-[0.3em] uppercase mb-1">Tools</h4>
          <p className="text-lg md:text-xl font-light tracking-widest uppercase text-cyan-50 drop-shadow-[0_0_10px_rgba(0,255,255,0.3)]">Figma</p>
          <p className="text-lg md:text-xl font-light tracking-widest uppercase text-cyan-50 drop-shadow-[0_0_10px_rgba(0,255,255,0.3)]">Canva</p>
          <p className="text-lg md:text-xl font-light tracking-widest uppercase text-cyan-50 drop-shadow-[0_0_10px_rgba(0,255,255,0.3)]">Adobe</p>
          <p className="text-lg md:text-xl font-light tracking-widest uppercase text-cyan-50 drop-shadow-[0_0_10px_rgba(0,255,255,0.3)]">Photoshop</p>
        </div>
      ),
      inStart: 129, inEnd: 136, outStart: 150, outEnd: 157
    },
    {
      id: "proj1", side: "right",
      content: <ProjectCard
        number="Project 01" title="SchedWise"
        desc="Full UI/UX design of a smart scheduling web application"
        cta="Click to explore" href="https://sched-wise.vercel.app" side="right" />,
      inStart: 164, inEnd: 171, outStart: 185, outEnd: 192
    },
    {
      id: "proj2", side: "left",
      content: <ProjectCard
        number="Project 02" title="Wedding Invite"
        desc="Static website for a wedding invitation experience"
        cta="Click to explore" href="https://ayush-kavya.vercel.app" side="left" />,
      inStart: 199, inEnd: 206, outStart: 220, outEnd: 227
    },
    {
      id: "proj3", side: "right",
      content: <CertificationsCard onCerts={onCerts} side="right" />,
      inStart: 234, inEnd: 241, outStart: 255, outEnd: 262
    },
    {
      id: "proj4", side: "left",
      content: <GalleryCard onGallery={onGallery} side="left" />,
      inStart: 269, inEnd: 276, outStart: 290, outEnd: 297
    },
    {
      id: "identity_left", side: "left",
      content: <h2 className="text-4xl md:text-6xl font-light tracking-[0.2em] uppercase text-transparent bg-clip-text bg-gradient-to-r from-cyan-200 to-white drop-shadow-[0_0_20px_rgba(0,255,255,0.5)]">Designer</h2>,
      inStart: 304, inEnd: 311, outStart: 315, outEnd: 322
    },
    {
      id: "identity_right", side: "right",
      content: <h2 className="text-4xl md:text-6xl font-light tracking-[0.2em] uppercase text-transparent bg-clip-text bg-gradient-to-l from-cyan-200 to-white drop-shadow-[0_0_20px_rgba(0,255,255,0.5)]">Engineer</h2>,
      inStart: 304, inEnd: 311, outStart: 315, outEnd: 322
    }
  ];
}

function SideContentManager({ scrollTarget, visible }: { scrollTarget: React.MutableRefObject<number>, visible: boolean }) {
  const { setActiveScene } = useContext(SceneContext);
  const sideContentData = useMemo(() => getSideContentData(() => setActiveScene('gallery'), () => setActiveScene('certs')), [setActiveScene]);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  const smoothScroll = useRef(0);

  useFrame(() => {
    smoothScroll.current = THREE.MathUtils.lerp(smoothScroll.current, scrollTarget.current, 0.04);
    const scroll = smoothScroll.current;
    
    sideContentData.forEach((item, i) => {
      const ref = itemRefs.current[i];
      if (!ref) return;
      
      // If not visible, force opacity to 0
      if (!visible) {
        if (item.id === "intro") {
          const l1 = ref.querySelector('.intro-line-1') as HTMLElement;
          const l2 = ref.querySelector('.intro-line-2') as HTMLElement;
          const l3 = ref.querySelector('.intro-line-3') as HTMLElement;
          const l4 = ref.querySelector('.intro-line-4') as HTMLElement;
          if (l1) l1.style.opacity = '0';
          if (l2) l2.style.opacity = '0';
          if (l3) l3.style.opacity = '0';
          if (l4) l4.style.opacity = '0';
        }
        ref.style.opacity = '0';
        ref.style.pointerEvents = 'none';
        return;
      }
      
      let opacity = 0;
      let yOffset = 20;

      if (item.id === "intro") {
        const line1 = ref.querySelector('.intro-line-1') as HTMLElement;
        const line2 = ref.querySelector('.intro-line-2') as HTMLElement;
        const line3 = ref.querySelector('.intro-line-3') as HTMLElement;
        const line4 = ref.querySelector('.intro-line-4') as HTMLElement;
        if (line1 && line2 && line3 && line4) {
          if (scroll < item.outStart) {
             line1.style.opacity = THREE.MathUtils.clamp((scroll - 42) / 7, 0, 1).toString();
             line2.style.opacity = THREE.MathUtils.clamp((scroll - 45) / 7, 0, 1).toString();
             line3.style.opacity = THREE.MathUtils.clamp((scroll - 48) / 7, 0, 1).toString();
             line4.style.opacity = THREE.MathUtils.clamp((scroll - 51) / 7, 0, 1).toString();
          } else {
             line1.style.opacity = '1';
             line2.style.opacity = '1';
             line3.style.opacity = '1';
             line4.style.opacity = '1';
          }
        }
      }

      if (scroll >= item.inStart && scroll <= item.outEnd) {
        if (scroll < item.inEnd) {
          const progress = (scroll - item.inStart) / (item.inEnd - item.inStart);
          opacity = item.id === "intro" ? 1 : progress; // Force parent visible for intro sequential fade
          yOffset = 20 * (1 - progress);
        } else if (scroll > item.outStart) {
          const progress = (scroll - item.outStart) / (item.outEnd - item.outStart);
          opacity = 1 - progress;
          yOffset = -20 * progress;
        } else {
          opacity = 1;
          yOffset = 0;
        }
      }

      const maxOpacity = item.id.includes("identity") ? 0.9 : 1.0;
      
      ref.style.opacity = (opacity * maxOpacity).toString();
      ref.style.transform = `translateY(${yOffset}px)`;
      ref.style.visibility = opacity > 0.01 ? 'visible' : 'hidden';
      ref.style.pointerEvents = (opacity > 0.8 && item.id.startsWith('proj')) ? 'auto' : 'none';
    });
  });

  return (
    <Html fullscreen zIndexRange={[0, 0]}>
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {sideContentData.map((item, i) => (
          <div
            key={item.id}
            ref={(el) => { itemRefs.current[i] = el; }}
            className={`absolute top-1/2 -translate-y-1/2 px-8 md:px-16 flex flex-col justify-center ${item.side === 'left' ? 'left-0 items-start' : 'right-0 items-end'} ${item.id.startsWith('proj') ? 'pointer-events-auto z-20' : 'pointer-events-none'}`}
            style={{ opacity: 0, visibility: 'hidden' }}
          >
            {item.content}
          </div>
        ))}
      </div>
    </Html>
  );
}



function CenterContact({ scrollTarget, visible }: { scrollTarget: React.MutableRefObject<number>, visible: boolean }) {
  const groupRef = useRef<THREE.Group>(null);
  const opacitySmooth = useRef(0);
  const divRef = useRef<HTMLDivElement>(null);
  
  useFrame(() => {
    const fadeIn = THREE.MathUtils.clamp((scrollTarget.current - 325) / 20, 0, 1);
    const targetOp = visible ? fadeIn : 0;
    
    opacitySmooth.current = THREE.MathUtils.lerp(opacitySmooth.current, targetOp, 0.15);
    
    if (groupRef.current) {
        groupRef.current.position.y = THREE.MathUtils.lerp(-4, 0, opacitySmooth.current);
        groupRef.current.visible = opacitySmooth.current > 0.01;
    }
    
    if (divRef.current) {
        divRef.current.style.opacity = opacitySmooth.current.toString();
        divRef.current.style.transform = `scale(${Math.max(0.6, opacitySmooth.current)})`;
        divRef.current.style.pointerEvents = opacitySmooth.current > 0.8 ? 'auto' : 'none';
    }
  });

  return (
    <group ref={groupRef}>
      <Html transform center distanceFactor={10} zIndexRange={[50, 0]} style={{ pointerEvents: 'none' }}>
        <div 
          ref={divRef}
          className="flex flex-col items-center justify-center pointer-events-auto"
          style={{ opacity: 0, transform: 'scale(0.6)', pointerEvents: 'none' }}
        >
          <h2 className="text-4xl md:text-5xl font-light tracking-[0.2em] uppercase text-transparent bg-clip-text bg-gradient-to-r from-cyan-200 to-white mb-8 drop-shadow-[0_0_20px_rgba(0,255,255,0.4)]">
            Let's connect
          </h2>
          <div className="flex flex-wrap justify-center gap-6 md:gap-8">
            <a href="mailto:ahirwarmihika@gmail.com" target="_blank" rel="noopener noreferrer" className="px-6 md:px-8 py-3 rounded-full border border-cyan-500/40 bg-cyan-500/10 text-cyan-100 text-xs md:text-sm tracking-[0.2em] hover:bg-cyan-500/30 hover:border-cyan-300 hover:shadow-[0_0_25px_rgba(0,255,255,0.4)] transition-all cursor-pointer">EMAIL</a>
            <a href="https://linkedin.com/in/mihika2" target="_blank" rel="noopener noreferrer" className="px-6 md:px-8 py-3 rounded-full border border-cyan-500/40 bg-cyan-500/10 text-cyan-100 text-xs md:text-sm tracking-[0.2em] hover:bg-cyan-500/30 hover:border-cyan-300 hover:shadow-[0_0_25px_rgba(0,255,255,0.4)] transition-all cursor-pointer">LINKEDIN</a>
            <a href="https://github.com/Mihika-02" target="_blank" rel="noopener noreferrer" className="px-6 md:px-8 py-3 rounded-full border border-cyan-500/40 bg-cyan-500/10 text-cyan-100 text-xs md:text-sm tracking-[0.2em] hover:bg-cyan-500/30 hover:border-cyan-300 hover:shadow-[0_0_25px_rgba(0,255,255,0.4)] transition-all cursor-pointer">GITHUB</a>
          </div>
        </div>
      </Html>
    </group>
  );
}

function DNACluster({ visible }: { visible: boolean }) {
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const isTablet = typeof window !== 'undefined' && window.innerWidth >= 768 && window.innerWidth < 1024;
  const scaleFactor = isMobile ? 0.7 : (isTablet ? 0.85 : 1.0);
  const zoomFactor = isMobile ? 1.4 : (isTablet ? 1.2 : 1.0);
  const particles = useMemo(() => generateDNA(scaleFactor, isMobile), [scaleFactor, isMobile]);
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const introTextRef = useRef<HTMLDivElement>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const repulseOffsets = useMemo(() => new Float32Array(particles.length * 3), [particles]);

  const scrollTarget = useRef(0);
  const scrollCurrent = useRef(0);
  const introSmooth = useRef(0);
  const endSmooth = useRef(0);
  
  const orbitVelocity = useRef(0);
  const orbitCurrent = useRef(0);
  const isDragging = useRef(false);
  const lastClientX = useRef(0);
  const pointerGlobal = useRef(new THREE.Vector2(0, 0));

  useEffect(() => {
    const handleDrag = (deltaX: number) => {
      if (scrollTarget.current < 25) return; // Prevent drag rotation during intro phase
      orbitVelocity.current += deltaX * 0.001; // Base sensitivity for unrestricted movement
    };

    const updatePointer = (clientX: number, clientY: number) => {
      pointerGlobal.current.x = (clientX / window.innerWidth) * 2 - 1;
      pointerGlobal.current.y = -(clientY / window.innerHeight) * 2 + 1;
    };

    const onWheel = (e: WheelEvent) => {
      scrollTarget.current += e.deltaY * 0.015;
      if (scrollTarget.current < 0) scrollTarget.current = 0;
      if (scrollTarget.current > 350) scrollTarget.current = 350;

      if (Math.abs(e.deltaX) > 0) {
        handleDrag(e.deltaX);
      }
    };

    let touchY = 0;
    let touchX = 0;
    const onTouchStart = (e: TouchEvent) => {
      touchY = e.touches[0].clientY;
      touchX = e.touches[0].clientX;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) updatePointer(e.touches[0].clientX, e.touches[0].clientY);
      const deltaY = touchY - e.touches[0].clientY;
      const deltaX = e.touches[0].clientX - touchX;
      
      scrollTarget.current += deltaY * 0.015;
      if (scrollTarget.current < 0) scrollTarget.current = 0;
      if (scrollTarget.current > 350) scrollTarget.current = 350;

      if (Math.abs(deltaX) > 0) {
        handleDrag(deltaX);
      }
      
      touchY = e.touches[0].clientY;
      touchX = e.touches[0].clientX;
    };

    const onPointerDown = (e: PointerEvent) => {
      isDragging.current = true;
      lastClientX.current = e.clientX;
      updatePointer(e.clientX, e.clientY);
    };

    const onPointerMove = (e: PointerEvent) => {
      updatePointer(e.clientX, e.clientY);
      if (isDragging.current) {
        const deltaX = e.clientX - lastClientX.current;
        handleDrag(deltaX);
        lastClientX.current = e.clientX;
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      isDragging.current = false;
    };
    
    // Global mouse move without click if requested (some users might not click)
    // To strictly require drag, we use pointerdown / up
    const onMouseMove = (e: MouseEvent) => {
      updatePointer(e.clientX, e.clientY);
    };

    window.addEventListener('wheel', onWheel);
    window.addEventListener('touchstart', onTouchStart);
    window.addEventListener('touchmove', onTouchMove);
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    
    return () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, []);

  useEffect(() => {
    if (meshRef.current) {
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        if (p.isTextMain) {
          // Boost the color for text particles so they glow clearly
          const boostColor = p.color.clone().lerp(new THREE.Color(0xffffff), 0.6);
          meshRef.current.setColorAt(i, boostColor);
        } else {
          // Dim the background particles slightly so the text is dominant
          const dimColor = p.color.clone().lerp(new THREE.Color(0x000000), 0.4);
          meshRef.current.setColorAt(i, dimColor);
        }
      }
      meshRef.current.instanceColor!.needsUpdate = true;
    }
  }, [particles]);

  useFrame((state, delta) => {
    if (!meshRef.current) return;
    meshRef.current.visible = visible;

    const time = state.clock.getElapsedTime();
    scrollCurrent.current = THREE.MathUtils.lerp(scrollCurrent.current, scrollTarget.current, 0.035);

    // Intro Animation Logic
    // Complete the intro slowly
    const introProgress = THREE.MathUtils.clamp(scrollTarget.current / 42, 0, 1);
    introSmooth.current = THREE.MathUtils.lerp(introSmooth.current, introProgress, 0.03);
    const pIntro = introSmooth.current;

    // Smoothstep curve for elegant ease-in, ease-out over the trajectory
    const easeP = pIntro * pIntro * (3 - 2 * pIntro); 

    const endProgress = THREE.MathUtils.clamp((scrollTarget.current - 325) / 25, 0, 1);
    endSmooth.current = THREE.MathUtils.lerp(endSmooth.current, endProgress, 0.04);
    const pEnd = endSmooth.current;
    const easeEnd = pEnd * pEnd * (3 - 2 * pEnd);

    // --- Orbit Rotation Logic ---
    orbitCurrent.current += orbitVelocity.current * (1 - easeEnd * 0.9);
    orbitVelocity.current *= 0.95; // Apply damping/inertia (friction)
    // Only apply rotation once intro starts dissolving so text stays perfectly horizontal
    meshRef.current.rotation.y = orbitCurrent.current * easeP;
    meshRef.current.rotation.x = 0;
    meshRef.current.rotation.z = 0;
    
    // HTML Text Fading (uses React ref)
    if (introTextRef.current) {
      introTextRef.current.style.opacity = Math.max(0, 1 - introProgress * 3).toString();
    }
    
    // Animate Camera Position
    const camX = Math.sin(easeP * Math.PI) * 7.5 * (1 - easeEnd); // Arc swing out to the side
    const camY = THREE.MathUtils.lerp(-8, 0, easeP); // Starts inside the tube looking along Y
    const camZ = THREE.MathUtils.lerp(0, 10 * zoomFactor, easeP) + easeEnd * 2; // Adjusted zoom for mobile/tablet
    state.camera.position.set(camX, camY, camZ);

    // Animate Camera Look Target so we sweep our view
    const lookY = THREE.MathUtils.lerp(2, 0, easeP); // Look more directly at Y=0 initially for the flat text
    const lookTarget = new THREE.Vector3(0, lookY, 0);
    state.camera.lookAt(lookTarget);

    // Animate Camera Up Vector to prevent gimbal snap when looking straight up
    state.camera.up.set(
      0,
      THREE.MathUtils.lerp(0, 1, easeP),
      THREE.MathUtils.lerp(-1, 0, easeP)
    ).normalize();

    // Map screen cursor exactly into the DNA's local coordinate space
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(pointerGlobal.current, state.camera);
    
    const camDir = new THREE.Vector3();
    state.camera.getWorldDirection(camDir);
    
    // Interaction plane: transitions from horizontal (intro) to facing-camera (orbit)
    const introPlaneNormal = new THREE.Vector3(0, 1, 0); // Flat on Y=0
    const currentPlaneNormal = new THREE.Vector3().lerpVectors(introPlaneNormal, camDir.clone().negate(), easeP).normalize();
    const interactionPlane = new THREE.Plane(currentPlaneNormal, 0); 
    
    let intersectPoint = raycaster.ray.intersectPlane(interactionPlane, new THREE.Vector3());
    const mouse3D = intersectPoint || new THREE.Vector3();

    if (meshRef.current) {
      // Important: Convert world point to local space so interaction perfectly matches the rotated DNA
      meshRef.current.worldToLocal(mouse3D);
    }

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      let rx = p.x;
      let ry = p.y;
      let rz = p.z;

      if (p.isDust) {
        ry += time * (p.speed || 0) * 100;
        rx += Math.sin(time * 0.5 + p.y) * 0.5;
      } else {
        // Slow structural rotation around Y axis - fade in during scroll so text is stable at first
        const rot = time * 0.1 * easeP;
        const cos = Math.cos(rot);
        const sin = Math.sin(rot);
        const basex = rx;
        const basez = rz;
        rx = basex * cos - basez * sin;
        rz = basex * sin + basez * cos;

        // Subtle pulsing / breathing effect
        const breathe = 1 + Math.sin(time * 1.5 + p.y * 0.2) * 0.04 * easeP;
        rx *= breathe;
        rz *= breathe;
      }

      // Infinite scroll wrapping by translating Y
      let y = ry + scrollCurrent.current * (1 - easeEnd * 0.9);
      y = THREE.MathUtils.euclideanModulo(y + LENGTH / 2, LENGTH) - LENGTH / 2;

      let fx = rx;
      let fy = y;
      let fz = rz;

      // Morphing from Text to DNA
      if (p.textX !== undefined && p.textY !== undefined && p.textZ !== undefined) {
        let morphP = easeP;
        // Organic dissolve stagger based on particle coordinates
        const stagger = (Math.sin(p.y * 10 + p.x * 10) * 0.1) + 0.1; 
        let localMorph = THREE.MathUtils.clamp((morphP - stagger) / (1 - 0.2), 0, 1);
        
        // Add a smooth easing to the individual particle morph
        localMorph = localMorph * localMorph * (3 - 2 * localMorph);

        const tX = p.textX; // No waving for perfectly stable text
        const tZ = p.textY + p.textZ; // Canvas Y mapped to depth
        const tY = p.depthOffset; // Exact horizontal flat plane layout
        
        fx = THREE.MathUtils.lerp(tX, fx, localMorph);
        fy = THREE.MathUtils.lerp(tY, fy, localMorph);
        fz = THREE.MathUtils.lerp(tZ, fz, localMorph);
      }

      // Mouse Repel Physics
      const dx = fx - mouse3D.x;
      const dy = fy - mouse3D.y;
      const dz = fz - mouse3D.z;
      const distSq = dx * dx + dy * dy + dz * dz;
      const isMobile = window.innerWidth < 768;
      const FORCE_DISTANCE = p.isDust ? 5.0 : (easeP < 0.5 ? 2.5 : (isMobile ? 2.5 : 4.0)); 

      if (distSq < FORCE_DISTANCE * FORCE_DISTANCE) {
        const dist = Math.sqrt(distSq) || 0.1;
        const force = (FORCE_DISTANCE - dist) / Math.max(0.1, FORCE_DISTANCE);
        
        // Limit the displacement so letters don't distort too much during intro
        let maxPush = isMobile ? 1.0 : 1.5;
        if (p.isTextMain && easeP < 0.5) {
          maxPush = isMobile ? 0.2 : 0.4; // very subtle push
        }
        
        maxPush *= (1 - easeEnd); // Reduce interaction at end
        
        const targetX = (dx / dist) * force * maxPush;
        const targetY = (dy / dist) * force * maxPush;
        const targetZ = (dz / dist) * force * maxPush;

        // Smooth spring action into the offset array
        repulseOffsets[i * 3 + 0] = THREE.MathUtils.lerp(repulseOffsets[i * 3 + 0], targetX, 0.1);
        repulseOffsets[i * 3 + 1] = THREE.MathUtils.lerp(repulseOffsets[i * 3 + 1], targetY, 0.1);
        repulseOffsets[i * 3 + 2] = THREE.MathUtils.lerp(repulseOffsets[i * 3 + 2], targetZ, 0.1);
      } else {
        // Snap back
        repulseOffsets[i * 3 + 0] = THREE.MathUtils.lerp(repulseOffsets[i * 3 + 0], 0, 0.04);
        repulseOffsets[i * 3 + 1] = THREE.MathUtils.lerp(repulseOffsets[i * 3 + 1], 0, 0.04);
        repulseOffsets[i * 3 + 2] = THREE.MathUtils.lerp(repulseOffsets[i * 3 + 2], 0, 0.04);
      }

      fx += repulseOffsets[i * 3 + 0];
      fy += repulseOffsets[i * 3 + 1];
      fz += repulseOffsets[i * 3 + 2];

      if (easeEnd > 0) {
        // Scatter smoothly into a calm sphere/cloud
        const hashX = Math.sin(i * 12.398) * 45;
        const hashY = Math.cos(i * 78.233) * 45 + (Math.sin(time + i) * 2);
        const hashZ = Math.sin(i * 45.123) * 45;
        
        fx = THREE.MathUtils.lerp(fx, hashX, easeEnd);
        fy = THREE.MathUtils.lerp(fy, hashY, easeEnd);
        fz = THREE.MathUtils.lerp(fz, hashZ, easeEnd);

        // Keep a fraction as ambient floating dust, shrink the rest
        const particleIdHash = Math.abs(Math.sin(i * 0.123));
        const targetScale = particleIdHash < 0.15 ? 0.3 : 0;
        const s = THREE.MathUtils.lerp(1, targetScale, easeEnd);
        dummy.scale.setScalar(Math.max(0.001, s));
      } else {
        dummy.scale.setScalar(1);
      }

      dummy.position.set(fx, fy, fz);
      
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    }
    
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <>
      <Html fullscreen className="pointer-events-none z-10">
        <div 
          ref={introTextRef}
          className="w-full h-full flex flex-col items-center justify-start pt-[30vh] relative"
        >
          {/* ── Personality trait ambient words ─────────────────────── */}
          {/* Static, zero interaction, fade with intro */}
          <span style={{ position:'absolute', top:'12%',  left:'6%',  fontSize:'11px', letterSpacing:'0.3em', textTransform:'uppercase', color:'rgba(160,230,255,0.48)', fontWeight:400, whiteSpace:'nowrap', textShadow:'0 0 12px rgba(0,210,255,0.5), 0 0 24px rgba(200,100,255,0.2)', pointerEvents:'none' }}>Creative</span>
          <span style={{ position:'absolute', top:'22%',  right:'8%', fontSize:'11px', letterSpacing:'0.3em', textTransform:'uppercase', color:'rgba(160,230,255,0.42)', fontWeight:400, whiteSpace:'nowrap', textShadow:'0 0 12px rgba(0,210,255,0.45), 0 0 24px rgba(200,100,255,0.18)', pointerEvents:'none' }}>Curious</span>
          <span style={{ position:'absolute', top:'68%',  left:'4%',  fontSize:'11px', letterSpacing:'0.3em', textTransform:'uppercase', color:'rgba(160,230,255,0.45)', fontWeight:400, whiteSpace:'nowrap', textShadow:'0 0 12px rgba(0,210,255,0.48), 0 0 24px rgba(200,100,255,0.19)', pointerEvents:'none' }}>Detail-oriented</span>
          <span style={{ position:'absolute', top:'78%',  right:'5%', fontSize:'11px', letterSpacing:'0.3em', textTransform:'uppercase', color:'rgba(160,230,255,0.40)', fontWeight:400, whiteSpace:'nowrap', textShadow:'0 0 12px rgba(0,210,255,0.42), 0 0 24px rgba(200,100,255,0.17)', pointerEvents:'none' }}>Experimental</span>
          <span style={{ position:'absolute', top:'45%',  right:'3%', fontSize:'11px', letterSpacing:'0.3em', textTransform:'uppercase', color:'rgba(160,230,255,0.38)', fontWeight:400, whiteSpace:'nowrap', textShadow:'0 0 12px rgba(0,210,255,0.40), 0 0 24px rgba(200,100,255,0.16)', pointerEvents:'none' }}>Builder</span>
          {/* ────────────────────────────────────────────────────────── */}
          <p 
            className="text-gray-300 text-sm md:text-base tracking-[0.3em] font-light uppercase text-center" 
            style={{ textShadow: "0 0 10px rgba(255,255,255,0.3)", opacity: 1 }}
          >
            WELCOME TO THE PORTFOLIO OF
          </p>
        </div>
      </Html>

    <group visible={visible}>
      <instancedMesh ref={meshRef} args={[undefined, undefined, particles.length]}>
        <sphereGeometry args={[0.025, 8, 8]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>

      <SideContentManager scrollTarget={scrollTarget} visible={visible} />
      <CenterContact scrollTarget={scrollTarget} visible={visible} />
    </group>
    </>
  );
}

function GalleryScene({ visible }: { visible: boolean }) {
  const particles = useMemo(() => {
    const pts = [];
    for (let i = 0; i < 1500; i++) {
      pts.push({
        x: (Math.random() - 0.5) * 60,
        y: (Math.random() - 0.5) * 60,
        z: (Math.random() - 0.5) * 60,
        color: new THREE.Color(0x222244).lerp(new THREE.Color(0x333355), Math.random())
      });
    }
    return pts;
  }, []);

  const meshRef = useRef<THREE.InstancedMesh>(null);
  
  useEffect(() => {
    if (meshRef.current) {
      particles.forEach((p, i) => {
        const mat = new THREE.Matrix4();
        mat.setPosition(p.x, p.y, p.z);
        meshRef.current!.setMatrixAt(i, mat);
        meshRef.current!.setColorAt(i, p.color);
      });
      meshRef.current.instanceMatrix.needsUpdate = true;
      meshRef.current.instanceColor!.needsUpdate = true;
    }
  }, [particles]);

  useFrame((state) => {
    if (!visible) return;
    const time = state.clock.getElapsedTime();
    if (meshRef.current) {
      meshRef.current.visible = visible;
      meshRef.current.rotation.y = time * 0.05;
    }
    state.camera.position.x = THREE.MathUtils.lerp(state.camera.position.x, state.pointer.x * 3, 0.05);
    state.camera.position.y = THREE.MathUtils.lerp(state.camera.position.y, state.pointer.y * 3, 0.05);
    state.camera.lookAt(0, 0, 0);
  });

  return (
    <group visible={visible}>
      <instancedMesh ref={meshRef} args={[undefined, undefined, particles.length]}>
        <sphereGeometry args={[0.03, 8, 8]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
    </group>
  );
}
function CertsScene({ visible }: { visible: boolean }) {
  const particles = useMemo(() => {
    const pts = [];
    for (let i = 0; i < 800; i++) { // Reduced particle count
      pts.push({
        x: (Math.random() - 0.5) * 50,
        y: (Math.random() - 0.5) * 50,
        z: (Math.random() - 0.5) * 50,
        color: new THREE.Color(0x112233).lerp(new THREE.Color(0x223344), Math.random()) // Darker, reduced intensity
      });
    }
    return pts;
  }, []);

  const meshRef = useRef<THREE.InstancedMesh>(null);

  useEffect(() => {
    if (meshRef.current) {
      particles.forEach((p, i) => {
        const mat = new THREE.Matrix4();
        mat.setPosition(p.x, p.y, p.z);
        meshRef.current!.setMatrixAt(i, mat);
        meshRef.current!.setColorAt(i, p.color);
      });
      meshRef.current.instanceMatrix.needsUpdate = true;
      meshRef.current.instanceColor!.needsUpdate = true;
    }
  }, [particles]);

  useFrame((state) => {
    if (!visible) return;
    const time = state.clock.getElapsedTime();
    if (meshRef.current) {
      meshRef.current.visible = visible;
      meshRef.current.rotation.y = time * 0.03; // Calmer motion
    }
    state.camera.position.x = THREE.MathUtils.lerp(state.camera.position.x, state.pointer.x * 2, 0.05);
    state.camera.position.y = THREE.MathUtils.lerp(state.camera.position.y, state.pointer.y * 2, 0.05);
    state.camera.lookAt(0, 0, 0);
  });

  return (
    <group visible={visible}>
      <instancedMesh ref={meshRef} args={[undefined, undefined, particles.length]}>
        <sphereGeometry args={[0.02, 8, 8]} /> {/* Smaller spheres */}
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
    </group>
  );
}

const CERTS_ITEMS = [
  { id: 1, title: "AI Tools Workshop", src: "/be10x.jpg", authority: "be10x" },
  { id: 2, title: "No Code Knockout", src: "/iete.png", authority: "IETE Students' Forum" },
  { id: 3, title: "HackVento 2K26", src: "/hackvento.jpg", authority: "Google Developer Groups" },
  { id: 4, title: "Prayatna 3.0", src: "/prayatna.jpg", authority: "AITR ACM & IEEE" },
  { id: 5, title: "Codathon 3.0", src: "/codathon.jpg", authority: "IETE Students' Forum" },
  { id: 6, title: "Xpecto '26", src: "/xpecto.jpg", authority: "IIT Mandi" },
];

function CertCard({ item, index, setFullView }: { item: any, index: number, setFullView: (item: any) => void }) {
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <div
      onClick={() => setFullView(item)}
      className="cert-card group cursor-pointer rounded-2xl overflow-hidden border border-cyan-500/20 hover:border-cyan-400/60 bg-black/50 backdrop-blur-md hover:shadow-[0_0_30px_rgba(0,255,255,0.3)] hover:-translate-y-2 transition-all duration-500 ease-out flex flex-col h-[350px] p-3"
      style={{ animationDelay: `${index * -1.2}s` }}
    >
      {/* Image Container */}
      <div className="w-full h-[75%] relative flex items-center justify-center bg-black/40 rounded-xl overflow-hidden border border-cyan-500/10 group-hover:border-cyan-400/30 transition-all duration-500">
        {!imgFailed ? (
          <img 
            src={item.src} 
            alt={item.title} 
            onError={() => setImgFailed(true)}
            className="w-full h-full object-contain filter brightness-[1.1] contrast-[1.1] group-hover:scale-105 group-hover:brightness-[1.2] transition-all duration-500 ease-out p-2" 
            loading="lazy" 
          />
        ) : (
          <div className="flex flex-col items-center justify-center text-center p-4 text-cyan-400/60">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mb-2 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="text-xs font-medium tracking-wider uppercase">Preview unavailable</span>
          </div>
        )}
        {/* Subtle dark overlay */}
        <div className="absolute inset-0 bg-black/20 group-hover:bg-transparent transition-colors duration-500" />
        {/* Soft glow */}
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-[radial-gradient(circle_at_center,rgba(6,182,212,0.15)_0%,transparent_70%)] pointer-events-none" />
      </div>
      
      {/* Info */}
      <div className="flex-1 flex flex-col justify-center pt-3 px-2">
        <p className="text-cyan-100 text-sm font-bold tracking-wider uppercase group-hover:text-cyan-200 transition-colors line-clamp-1">{item.title}</p>
        <span className="text-cyan-400/60 text-[10px] tracking-[0.2em] uppercase block mt-1">{item.authority}</span>
      </div>
    </div>
  );
}

function CertsUI() {
  const { setActiveScene, fullView, setFullView } = useContext(SceneContext);

  return (
    <>
      <style>{`
        @keyframes certFloatY {
          0%,100% { transform: translateY(0px); }
          50%      { transform: translateY(-3px); } /* Reduced floating randomness */
        }
        .cert-card { animation: certFloatY 6s ease-in-out infinite; }
        .cert-card:nth-child(2n) { animation-delay: -1.5s; }
        .cert-card:nth-child(3n) { animation-delay: -3s; }
      `}</style>

      {/* Header bar */}
      <div className="absolute top-0 left-0 right-0 z-40 flex items-center justify-between px-6 py-5 bg-gradient-to-b from-black/80 to-transparent pointer-events-none">
        <button
          onClick={() => setActiveScene('portfolio')}
          className="px-5 py-2 border border-cyan-500/40 rounded-full text-cyan-100 tracking-widest text-xs uppercase bg-black/50 backdrop-blur-md hover:bg-cyan-500/20 hover:shadow-[0_0_20px_rgba(0,255,255,0.3)] transition-all cursor-pointer pointer-events-auto"
        >
          ← Back
        </button>
        <span className="text-cyan-300/60 tracking-[0.4em] text-[10px] uppercase font-light">Certifications / Credentials</span>
      </div>

      {/* Adaptive Grid */}
      <div className="absolute inset-0 overflow-y-auto pt-24 pb-10 px-4 md:px-12 pointer-events-auto z-30">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 md:gap-8 max-w-7xl mx-auto w-full">
          {CERTS_ITEMS.map((item, i) => (
            <CertCard key={item.id} item={item} index={i} setFullView={setFullView} />
          ))}
        </div>
      </div>

      {/* Full-view modal */}
      <div
        className={`absolute inset-0 bg-black/95 backdrop-blur-xl flex items-center justify-center z-50 transition-opacity duration-500 pointer-events-auto p-4 md:p-12 ${fullView && 'authority' in fullView ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setFullView(null)}
      >
        {fullView && 'authority' in fullView && (
          <div
            className="w-full h-full max-w-6xl max-h-[90vh] flex flex-col bg-gradient-to-br from-cyan-950/20 to-black border border-cyan-500/30 rounded-2xl shadow-[0_0_60px_rgba(0,255,255,0.15)] overflow-hidden scale-100 transition-transform duration-500 relative"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex-1 w-full h-full min-h-0 relative p-4 md:p-8 flex items-center justify-center bg-black/40">
              <img 
                src={fullView.src} 
                alt={fullView.title} 
                className="w-full h-full object-contain filter brightness-[1.05] contrast-[1.05] drop-shadow-[0_0_20px_rgba(0,255,255,0.1)]" 
              />
            </div>
            <div className="px-6 py-4 flex items-center justify-between bg-black/60 border-t border-cyan-500/10 backdrop-blur-md shrink-0">
              <div className="flex flex-col">
                <span className="text-cyan-100/90 text-sm md:text-base tracking-[0.2em] uppercase font-light">{fullView.title}</span>
                <span className="text-cyan-400/50 text-[10px] tracking-[0.3em] uppercase mt-1">{fullView.authority}</span>
              </div>
              <button onClick={() => setFullView(null)} className="text-cyan-400/60 hover:text-cyan-200 text-xs tracking-widest uppercase transition-colors cursor-pointer px-4 py-2 border border-cyan-500/30 rounded-full hover:bg-cyan-500/10">Close ✕</button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}


const GALLERY_ITEMS = [
  { id: 1, title: "Alpha Poster",   gradient: "from-cyan-900/60 to-indigo-900/60" },
  { id: 2, title: "Beta Render",    gradient: "from-violet-900/60 to-cyan-900/40" },
  { id: 3, title: "Gamma Shot",     gradient: "from-teal-900/60 to-blue-900/60" },
  { id: 4, title: "Delta Concept",  gradient: "from-indigo-900/60 to-purple-900/60" },
  { id: 5, title: "Epsilon Cover",  gradient: "from-cyan-800/50 to-slate-900/60" },
  { id: 6, title: "Zeta Visual",    gradient: "from-blue-900/60 to-cyan-900/50" },
  { id: 7, title: "Eta Study",      gradient: "from-purple-900/50 to-indigo-900/60" },
  { id: 8, title: "Theta Frame",    gradient: "from-teal-900/50 to-cyan-800/50" },
];

function GalleryUI() {
  const { setActiveScene, fullView, setFullView } = useContext(SceneContext);

  return (
    <>
      {/* Floating keyframe animation style */}
      <style>{`
        @keyframes floatY {
          0%,100% { transform: translateY(0px); }
          50%      { transform: translateY(-6px); }
        }
        .gallery-card { animation: floatY 4s ease-in-out infinite; }
        .gallery-card:nth-child(2n)  { animation-duration: 5s; animation-delay: -1s; }
        .gallery-card:nth-child(3n)  { animation-duration: 4.5s; animation-delay: -2s; }
        .gallery-card:nth-child(4n)  { animation-duration: 5.5s; animation-delay: -0.5s; }
      `}</style>

      {/* Header bar */}
      <div className="absolute top-0 left-0 right-0 z-40 flex items-center justify-between px-6 py-5 bg-gradient-to-b from-black/80 to-transparent pointer-events-none">
        <button
          onClick={() => setActiveScene('portfolio')}
          className="px-5 py-2 border border-cyan-500/40 rounded-full text-cyan-100 tracking-widest text-xs uppercase bg-black/50 backdrop-blur-md hover:bg-cyan-500/20 hover:shadow-[0_0_20px_rgba(0,255,255,0.3)] transition-all cursor-pointer pointer-events-auto"
        >
          ← Back
        </button>
        <span className="text-cyan-300/60 tracking-[0.4em] text-[10px] uppercase font-light">Project 04 / Gallery</span>
      </div>

      {/* Scrollable grid */}
      <div className="absolute inset-0 overflow-y-auto pt-20 pb-10 px-4 md:px-12 pointer-events-auto z-30">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6 max-w-6xl mx-auto">
          {GALLERY_ITEMS.map((item, i) => (
            <div
              key={item.id}
              onClick={() => setFullView(item)}
              className="gallery-card group cursor-pointer rounded-xl overflow-hidden border border-cyan-500/15 hover:border-cyan-400/60 bg-black/30 backdrop-blur-sm hover:shadow-[0_0_24px_rgba(0,255,255,0.25)] transition-all duration-400 hover:scale-[1.04]"
              style={{ animationDelay: `${i * -0.7}s` }}
            >
              {/* Thumbnail */}
              <div className={`w-full aspect-[3/4] bg-gradient-to-br ${item.gradient} relative flex items-end`}>
                <div className="absolute inset-0 bg-black/20 group-hover:bg-black/5 transition-colors" />
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-t from-cyan-500/10 to-transparent" />
              </div>
              {/* Label */}
              <div className="px-3 py-2">
                <p className="text-cyan-100/70 text-[11px] tracking-[0.2em] uppercase font-light group-hover:text-cyan-200 transition-colors">{item.title}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Full-view modal */}
      <div
        className={`absolute inset-0 bg-black/92 backdrop-blur-xl flex items-center justify-center z-50 transition-opacity duration-400 pointer-events-auto ${fullView ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setFullView(null)}
      >
        {fullView && (
          <div
            className="w-[85vw] max-w-2xl bg-gradient-to-br from-cyan-900/20 to-black border border-cyan-500/30 rounded-2xl shadow-[0_0_60px_rgba(0,255,255,0.1)] overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className={`w-full aspect-[4/3] bg-gradient-to-br ${fullView.gradient}`} />
            <div className="px-8 py-5 flex items-center justify-between">
              <span className="text-cyan-100 text-lg tracking-[0.3em] font-light uppercase">{fullView.title}</span>
              <button onClick={() => setFullView(null)} className="text-cyan-400/60 hover:text-cyan-200 text-xs tracking-widest uppercase transition-colors cursor-pointer">Close ✕</button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}


export default function App() {
  const [activeScene, setActiveScene] = useState<'portfolio' | 'gallery' | 'certs'>('portfolio');
  const [displayScene, setDisplayScene] = useState<'portfolio' | 'gallery' | 'certs'>('portfolio');
  const [isFading, setIsFading] = useState(false);
  const [fullView, setFullView] = useState<any>(null);

  useEffect(() => {
    if (activeScene !== displayScene) {
      setIsFading(true);
      setFullView(null); // Reset full view state on scene change to prevent leaked modal states
      const timer = setTimeout(() => {
        setDisplayScene(activeScene);
        setIsFading(false);
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [activeScene, displayScene]);

  return (
    <SceneContext.Provider value={{ activeScene, setActiveScene, fullView, setFullView }}>
      <div className="relative w-full h-full bg-black overflow-hidden">
        <Canvas
          camera={{ position: [0, 0, 10], fov: 60 }}
          gl={{ powerPreference: 'high-performance', antialias: false }}
          dpr={[1, 2]}
        >
          <color attach="background" args={['#000000']} />
          <fog attach="fog" args={['#000000', 5, 25]} />
          
          <DNACluster visible={displayScene === 'portfolio'} />
          <GalleryScene visible={displayScene === 'gallery'} />
          <CertsScene visible={displayScene === 'certs'} />

          <EffectComposer multisampling={0}>
            <Bloom luminanceThreshold={0} mipmapBlur intensity={1.8} />
            <DepthOfField target={[0, 0, 0]} focalLength={0.02} bokehScale={3} height={480} />
          </EffectComposer>
        </Canvas>

        <div className={`absolute inset-0 bg-black z-50 transition-opacity duration-500 ${isFading ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`} />
        
        {displayScene === 'gallery' && !isFading && <GalleryUI />}
        {displayScene === 'certs' && !isFading && <CertsUI />}
      </div>
    </SceneContext.Provider>
  );
}
