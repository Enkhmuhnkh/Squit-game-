import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { playCrack, playStep } from '../../lib/sfx.js';

// ───────────────────────── хэмжээсүүд ─────────────────────────
const ROW = 3.2;   // шатуудын хоорондох зай (z тэнхлэг, урагшаа = -z)
const LANE = 1.5;  // зүүн/баруун шилний төвийн x
const PANE = 2.6;  // шилний хэмжээ
const CHAR_SCALE = 0.62;

const stepZ = (n) => -n * ROW;

// ───────────────────────── шил ─────────────────────────
const PANE_LOOK = {
  unknown: { color: '#9fd8ff', emissive: '#1d5b8f', base: 0.25, opacity: 0.4 },
  safe:    { color: '#7dffc4', emissive: '#16c98a', base: 0.55, opacity: 0.55 },
  cheat:   { color: '#7dffc4', emissive: '#19ff9d', base: 0.6,  opacity: 0.6 },
  broken:  { color: '#9fd8ff', emissive: '#1d5b8f', base: 0.25, opacity: 0.4 },
};

function Pane({ n, side, state, clickable, onChoose }) {
  const group = useRef();
  const mat = useRef();
  const fall = useRef(state === 'broken' ? 1 : 0); // refresh хийхэд аль хэдийн хагарсан шил шууд алга
  const [hover, setHover] = useState(false);
  const geo = useMemo(() => new THREE.BoxGeometry(PANE, 0.16, PANE), []);
  const look = PANE_LOOK[state];

  useFrame((st, dt) => {
    if (state === 'broken' && fall.current < 1) fall.current = Math.min(1, fall.current + dt / 1.3);
    const f = fall.current;
    const g = group.current;
    if (g) {
      g.visible = f < 1;
      g.position.y = -(f * f) * 9;          // хагараад доош унана
      g.rotation.x = f * 1.3;
      g.rotation.z = f * 0.9 * (side === 'L' ? 1 : -1);
    }
    if (mat.current) {
      const pulse = state === 'cheat' ? 0.4 * (1 + Math.sin(st.clock.elapsedTime * 7)) : 0;
      mat.current.emissiveIntensity = (hover ? 1.0 : look.base) + pulse;
      mat.current.opacity = state === 'broken' ? Math.max(0, look.opacity * (1 - f)) : look.opacity;
    }
  });

  return (
    <group ref={group} position={[side === 'L' ? -LANE : LANE, 0, stepZ(n)]}>
      <mesh
        geometry={geo}
        onClick={(e) => {
          e.stopPropagation();
          if (clickable) onChoose(side);
        }}
        onPointerOver={(e) => {
          if (!clickable) return;
          e.stopPropagation();
          setHover(true);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          setHover(false);
          document.body.style.cursor = '';
        }}
      >
        <meshPhysicalMaterial
          ref={mat}
          color={hover ? '#ffe9a8' : look.color}
          emissive={hover ? '#ffc94d' : look.emissive}
          emissiveIntensity={look.base}
          transparent
          opacity={look.opacity}
          roughness={0.05}
          metalness={0.1}
          clearcoat={1}
          depthWrite={false}
        />
      </mesh>
      <lineSegments>
        <edgesGeometry args={[geo]} />
        <lineBasicMaterial color="#e6f6ff" transparent opacity={0.9} />
      </lineSegments>
    </group>
  );
}

// ───────────────────────── тоглогч (бүгд адилхан хувцастай) ─────────────────────────
const JACKET = '#1fa58a';
const PANTS = '#1b8f78';

function numberTexture(seat) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 80;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f4f4f0';
  ctx.fillRect(0, 0, 128, 80);
  ctx.strokeStyle = '#222';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, 124, 76);
  ctx.fillStyle = '#111';
  ctx.font = 'bold 54px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(seat).padStart(3, '0'), 64, 44);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function Character({ player, isMe, isTurn, target, deathPos, showLabel }) {
  const group = useRef();
  const pos = useRef(new THREE.Vector3(target.x, 0, target.z));
  const fall = useRef(player.alive ? 0 : 1); // refresh хийхэд аль хэдийн үхсэн тоглогч харагдахгүй
  const marker = useRef();
  const tex = useMemo(() => numberTexture(player.seat), [player.seat]);

  useFrame((st, dt) => {
    const g = group.current;
    if (!g) return;
    if (player.alive) {
      const k = 1 - Math.exp(-dt * 4);
      const dx = target.x - pos.current.x;
      const dz = target.z - pos.current.z;
      pos.current.x += dx * k;
      pos.current.z += dz * k;
      const dist = Math.hypot(dx, dz);
      // Алхах үед үсрэх хөдөлгөөн
      const hop = Math.min(dist, 1) * 0.55 * Math.abs(Math.sin(st.clock.elapsedTime * 12));
      g.visible = true;
      g.position.set(pos.current.x, hop, pos.current.z);
      g.rotation.set(0, 0, 0);
    } else {
      // Үхсэн: хагарсан шил рүү гулсаад доош унана
      fall.current = Math.min(1, fall.current + dt / 1.5);
      const f = fall.current;
      const slide = Math.min(1, f * 3);
      const x = pos.current.x + (deathPos.x - pos.current.x) * slide;
      const z = pos.current.z + (deathPos.z - pos.current.z) * slide;
      const drop = f < 0.3 ? 0 : ((f - 0.3) / 0.7) ** 2 * 11;
      g.visible = f < 1;
      g.position.set(x, -drop, z);
      g.rotation.set(f * 2.2, 0, f * 0.8);
    }
    if (marker.current) marker.current.position.y = 2.55 + Math.sin(st.clock.elapsedTime * 5) * 0.12;
  });

  return (
    <group ref={group} scale={CHAR_SCALE}>
      {/* хөл */}
      <mesh position={[-0.17, 0.36, 0]}><cylinderGeometry args={[0.14, 0.13, 0.72, 10]} /><meshStandardMaterial color={PANTS} /></mesh>
      <mesh position={[0.17, 0.36, 0]}><cylinderGeometry args={[0.14, 0.13, 0.72, 10]} /><meshStandardMaterial color={PANTS} /></mesh>
      {/* цагаан судал */}
      <mesh position={[-0.31, 0.38, 0]}><boxGeometry args={[0.03, 0.7, 0.2]} /><meshStandardMaterial color="#f2f2ee" /></mesh>
      <mesh position={[0.31, 0.38, 0]}><boxGeometry args={[0.03, 0.7, 0.2]} /><meshStandardMaterial color="#f2f2ee" /></mesh>
      {/* гутал */}
      <mesh position={[-0.17, 0.05, -0.05]}><boxGeometry args={[0.26, 0.12, 0.38]} /><meshStandardMaterial color="#f5f5f5" /></mesh>
      <mesh position={[0.17, 0.05, -0.05]}><boxGeometry args={[0.26, 0.12, 0.38]} /><meshStandardMaterial color="#f5f5f5" /></mesh>
      {/* их бие */}
      <mesh position={[0, 1.1, 0]}><capsuleGeometry args={[0.3, 0.5, 4, 14]} /><meshStandardMaterial color={JACKET} /></mesh>
      <mesh position={[0, 1.1, 0]}><boxGeometry args={[0.04, 0.95, 0.62]} /><meshStandardMaterial color="#f2f2ee" /></mesh>
      {/* гар */}
      <mesh position={[-0.43, 1.05, 0]} rotation={[0, 0, 0.14]}><capsuleGeometry args={[0.09, 0.5, 4, 8]} /><meshStandardMaterial color={JACKET} /></mesh>
      <mesh position={[0.43, 1.05, 0]} rotation={[0, 0, -0.14]}><capsuleGeometry args={[0.09, 0.5, 4, 8]} /><meshStandardMaterial color={JACKET} /></mesh>
      {/* толгой */}
      <mesh position={[0, 1.68, 0]}><sphereGeometry args={[0.24, 18, 14]} /><meshStandardMaterial color="#f2c9a5" /></mesh>
      <mesh position={[0, 1.72, 0]}>
        <sphereGeometry args={[0.255, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#1c1c1c" />
      </mesh>
      {/* дугаар: ард (камер руу) болон өмнө */}
      <mesh position={[0, 1.2, 0.31]}><planeGeometry args={[0.46, 0.29]} /><meshBasicMaterial map={tex} /></mesh>
      <mesh position={[0, 1.2, -0.31]} rotation={[0, Math.PI, 0]}><planeGeometry args={[0.46, 0.29]} /><meshBasicMaterial map={tex} /></mesh>

      {/* "Та" — алтан бөгж */}
      {isMe && (
        <mesh position={[0, 0.03, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.55, 0.05, 8, 32]} />
          <meshStandardMaterial color="#ffc94d" emissive="#ffb300" emissiveIntensity={1.2} />
        </mesh>
      )}
      {/* Ээлжтэй тоглогчийн дээр сум */}
      {isTurn && (
        <mesh ref={marker} position={[0, 2.55, 0]} rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[0.2, 0.4, 12]} />
          <meshStandardMaterial color="#ffd54a" emissive="#ffb300" emissiveIntensity={1.4} />
        </mesh>
      )}
      {showLabel && player.alive && (
        <Html position={[0, 2.0, 0]} center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
          <div
            className={`whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-bold shadow ${
              isMe ? 'bg-amber-400 text-black' : 'bg-black/70 text-white'
            }`}
          >
            {player.nickname}
          </div>
        </Html>
      )}
    </group>
  );
}

/** Нэг шат дээр олон хүн зогсвол жижиг тор хэлбэрээр байрлуулна. */
function slot(i, count, onStart) {
  const cols = onStart ? Math.min(7, count) : Math.min(3, count);
  const gap = onStart ? 0.9 : 0.7;
  const col = i % cols;
  const row = Math.floor(i / cols);
  return [(col - (cols - 1) / 2) * gap, row * 0.6 - (onStart ? 0 : 0.45)];
}

// ───────────────────────── камер ─────────────────────────
function CameraRig({ focusZ, shakeKey }) {
  const { camera } = useThree();
  const look = useRef(focusZ - 3);
  const shake = useRef(0);
  const last = useRef(shakeKey);

  useFrame((_, dt) => {
    const k = 1 - Math.exp(-dt * 3);
    if (shakeKey !== last.current) {
      last.current = shakeKey;
      if (shakeKey) shake.current = 0.35; // шил хагарахад дэлгэц сэгсэрнэ
    }
    shake.current = Math.max(0, shake.current - dt);
    const s = shake.current;
    camera.position.x += (0 - camera.position.x) * k;
    camera.position.y += (7.6 - camera.position.y) * k;
    camera.position.z += (focusZ + 10.5 - camera.position.z) * k;
    look.current += (focusZ - 3 - look.current) * k;
    camera.position.x += (Math.random() - 0.5) * s * 0.5;
    camera.position.y += (Math.random() - 0.5) * s * 0.5;
    camera.lookAt(0, 0.4, look.current);
  });
  return null;
}

// ───────────────────────── орчин ─────────────────────────
function Environment({ steps, focusZ }) {
  const light = useRef();
  const endZ = stepZ(steps + 1);
  const railLen = Math.abs(endZ) + 6;

  const dust = useMemo(() => {
    const n = 360;
    const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      a[i * 3] = (Math.random() - 0.5) * 34;
      a[i * 3 + 1] = Math.random() * 12 - 3;
      a[i * 3 + 2] = 8 - Math.random() * (steps + 4) * ROW;
    }
    return a;
  }, [steps]);

  useFrame((_, dt) => {
    if (light.current) light.current.position.z += (focusZ + 2 - light.current.position.z) * (1 - Math.exp(-dt * 3));
  });

  const beams = [];
  for (let n = 0; n <= steps; n++) beams.push(n);
  const pillars = [];
  for (let i = 0; i < Math.ceil(railLen / 9) + 1; i++) pillars.push(i);

  return (
    <>
      <color attach="background" args={['#070b1a']} />
      <fog attach="fog" args={['#070b1a', 16, 52]} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[6, 14, 8]} intensity={1.1} />
      <pointLight ref={light} position={[0, 5, 0]} intensity={30} distance={22} color="#bfe6ff" />
      <pointLight position={[0, -7, endZ / 2]} intensity={40} distance={40} color="#ff3b4d" />

      {/* Эхлэл ба төгсгөлийн тавцан */}
      <mesh position={[0, -0.3, 2.2]}>
        <boxGeometry args={[10, 0.5, 6]} />
        <meshStandardMaterial color="#1b2740" metalness={0.4} roughness={0.5} />
      </mesh>
      <mesh position={[0, -0.02, -0.75]}>
        <boxGeometry args={[10, 0.06, 0.12]} />
        <meshStandardMaterial color="#ffc94d" emissive="#ffb300" emissiveIntensity={1.2} />
      </mesh>
      <Html position={[0, 0.2, 3.2]} center style={{ pointerEvents: 'none' }}>
        <div className="rounded bg-black/60 px-2 py-0.5 text-xs font-bold tracking-widest text-amber-300">START</div>
      </Html>

      <mesh position={[0, -0.3, endZ - 2.2]}>
        <boxGeometry args={[10, 0.5, 6]} />
        <meshStandardMaterial color="#143d33" metalness={0.4} roughness={0.5} emissive="#0c3a2a" emissiveIntensity={0.6} />
      </mesh>
      <Html position={[0, 0.3, endZ - 2.2]} center style={{ pointerEvents: 'none' }}>
        <div className="rounded bg-emerald-900/80 px-2 py-0.5 text-xs font-bold tracking-widest text-emerald-300">FINISH</div>
      </Html>

      {/* Эгнээ хоорондын ган дам нуруу */}
      {beams.map((n) => (
        <mesh key={n} position={[0, -0.05, stepZ(n) - ROW / 2]}>
          <boxGeometry args={[2 * LANE + PANE + 0.7, 0.12, 0.2]} />
          <meshStandardMaterial color="#26324d" metalness={0.6} roughness={0.4} />
        </mesh>
      ))}
      {/* Хажуугийн алтлаг гэрэлтэх хашлага */}
      {[-1, 1].map((sx) => (
        <mesh key={sx} position={[sx * (LANE + PANE / 2 + 0.45), 0.35, endZ / 2 - 1]}>
          <boxGeometry args={[0.12, 0.12, railLen]} />
          <meshStandardMaterial color="#ffc94d" emissive="#ffb300" emissiveIntensity={0.9} />
        </mesh>
      ))}
      {/* Тулгуур багана */}
      {pillars.map((i) =>
        [-1, 1].map((sx) => (
          <group key={`${i}${sx}`} position={[sx * 8, -2, 4 - i * 9]}>
            <mesh><boxGeometry args={[1.1, 18, 1.1]} /><meshStandardMaterial color="#10182e" metalness={0.5} roughness={0.6} /></mesh>
            <mesh position={[-sx * 0.58, 0, 0]}><boxGeometry args={[0.1, 18, 0.1]} /><meshStandardMaterial color="#5ad1ff" emissive="#2bb8f0" emissiveIntensity={1.1} /></mesh>
          </group>
        )),
      )}
      {/* Тоос / оч */}
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[dust, 3]} />
        </bufferGeometry>
        <pointsMaterial size={0.09} color="#9bd7ff" transparent opacity={0.7} sizeAttenuation depthWrite={false} />
      </points>
    </>
  );
}

// ───────────────────────── дүр зураг ─────────────────────────
function Scene({ game, myId, cheat, shakeKey, onChoose }) {
  const me = game.players.find((p) => p.id === myId);
  const current = game.players.find((p) => p.id === game.currentPlayerId);
  const myTurn = game.status === 'running' && game.currentPlayerId === myId;
  const maxStep = Math.max(0, ...game.players.map((p) => p.step));
  const focusStep = current?.step ?? maxStep;
  const focusZ = stepZ(focusStep);
  const showAllLabels = game.players.length <= 8;

  // Нэг шат дээр байгаа амьд тоглогчдыг бүлэглэнэ
  const groups = new Map();
  for (const p of game.players) {
    if (!p.alive) continue;
    if (!groups.has(p.step)) groups.set(p.step, []);
    groups.get(p.step).push(p);
  }

  const rows = [];
  for (let n = 1; n <= game.steps; n++) rows.push(n);

  function paneState(n, side) {
    const safe = game.revealed[n - 1];
    if (safe) return safe === side ? 'safe' : 'broken';
    if (cheat && cheat.step === n && cheat.safeSide === side) return 'cheat'; // зөвхөн надад
    return 'unknown';
  }

  return (
    <>
      <Environment steps={game.steps} focusZ={focusZ} />
      <CameraRig focusZ={focusZ} shakeKey={shakeKey} />

      {rows.map((n) =>
        ['L', 'R'].map((side) => {
          const state = paneState(n, side);
          const isMyNext = !!me && me.alive && !me.finished && myTurn && n === me.step + 1;
          return (
            <Pane
              key={`${n}${side}`}
              n={n}
              side={side}
              state={state}
              clickable={isMyNext && game.revealed[n - 1] == null}
              onChoose={onChoose}
            />
          );
        }),
      )}

      {game.players.map((p) => {
        const list = groups.get(p.step) ?? [];
        const idx = Math.max(0, list.findIndex((q) => q.id === p.id));
        const [dx, dz] = slot(idx, list.length, p.step === 0);
        const safe = p.step > 0 ? game.revealed[p.step - 1] : null;
        const laneX = safe === 'L' ? -LANE : safe === 'R' ? LANE : 0;
        const target = { x: laneX + dx, z: stepZ(p.step) + dz + (p.step === 0 ? 1.4 : 0) };

        // Үхсэн тоглогч дараагийн шатны хагарсан шилэн дээр унана
        const n = p.step + 1;
        const safeNext = game.revealed[n - 1];
        const deathPos = { x: safeNext === 'L' ? LANE : safeNext === 'R' ? -LANE : 0, z: stepZ(n) };

        return (
          <Character
            key={p.id}
            player={p}
            isMe={p.id === myId}
            isTurn={game.status === 'running' && p.id === game.currentPlayerId}
            target={target}
            deathPos={deathPos}
            showLabel={showAllLabels || p.id === myId || p.id === game.currentPlayerId}
          />
        );
      })}
    </>
  );
}

export default function Bridge3D({ game, myId, cheat, lastStep, onChoose }) {
  // Дуу: хэн нэгний гишгэлт бүрт
  const lastId = useRef(null);
  const [shakeKey, setShakeKey] = useState(0);
  useEffect(() => {
    if (!lastStep || lastStep.id === lastId.current) return;
    lastId.current = lastStep.id;
    if (lastStep.safe) {
      playStep();
    } else {
      playCrack();
      setShakeKey(lastStep.id);
    }
  }, [lastStep]);

  return (
    <div className="relative h-[420px] w-full overflow-hidden rounded-2xl ring-1 ring-amber-300/25 sm:h-[560px]">
      <Canvas
        dpr={[1, 1.75]}
        camera={{ position: [0, 7.6, 11], fov: 48, near: 0.1, far: 140 }}
        gl={{ antialias: true }}
      >
        <Scene game={game} myId={myId} cheat={cheat} shakeKey={shakeKey} onChoose={onChoose} />
      </Canvas>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-[#070b1a] to-transparent" />
    </div>
  );
}
