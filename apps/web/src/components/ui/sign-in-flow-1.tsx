"use client";

import React, { useState, useMemo, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

/* â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
type Uniforms = {
  [key: string]: {
    value: number[] | number[][] | number;
    type: string;
  };
};

interface ShaderProps {
  source: string;
  uniforms: {
    [key: string]: {
      value: number[] | number[][] | number;
      type: string;
    };
  };
  maxFps?: number;
}

interface SignInPageProps {
  className?: string;
  initialTab?: "signin" | "signup";
}

/*â”€â”€ CanvasRevealEffect â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
export const CanvasRevealEffect = ({
  animationSpeed = 10,
  opacities = [0.3, 0.3, 0.3, 0.5, 0.5, 0.5, 0.8, 0.8, 0.8, 1],
  colors = [[0, 255, 255]],
  containerClassName,
  dotSize,
  showGradient = true,
  reverse = false,
}: {
  animationSpeed?: number;
  opacities?: number[];
  colors?: number[][];
  containerClassName?: string;
  dotSize?: number;
  showGradient?: boolean;
  reverse?: boolean;
}) => {
  return (
    <div className={cn("h-full relative w-full", containerClassName)}>
      <div className="h-full w-full">
        <DotMatrix
          colors={colors ?? [[0, 255, 255]]}
          dotSize={dotSize ?? 3}
          opacities={
            opacities ?? [0.3, 0.3, 0.3, 0.5, 0.5, 0.5, 0.8, 0.8, 0.8, 1]
          }
          shader={`
            ${reverse ? "u_reverse_active" : "false"}_;
            animation_speed_factor_${animationSpeed.toFixed(1)}_;
          `}
          center={["x", "y"]}
        />
      </div>
      {showGradient && (
        <div className="absolute inset-0 bg-gradient-to-t from-black to-transparent" />
      )}
    </div>
  );
};

/* â”€â”€ DotMatrix â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
interface DotMatrixProps {
  colors?: number[][];
  opacities?: number[];
  totalSize?: number;
  dotSize?: number;
  shader?: string;
  center?: ("x" | "y")[];
}

const DotMatrix: React.FC<DotMatrixProps> = ({
  colors = [[0, 0, 0]],
  opacities = [0.04, 0.04, 0.04, 0.04, 0.04, 0.08, 0.08, 0.08, 0.08, 0.14],
  totalSize = 20,
  dotSize = 2,
  shader = "",
  center = ["x", "y"],
}) => {
  const uniforms = React.useMemo(() => {
    let colorsArray = [
      colors[0],
      colors[0],
      colors[0],
      colors[0],
      colors[0],
      colors[0],
    ];
    if (colors.length === 2) {
      colorsArray = [
        colors[0],
        colors[0],
        colors[0],
        colors[1],
        colors[1],
        colors[1],
      ];
    } else if (colors.length === 3) {
      colorsArray = [
        colors[0],
        colors[0],
        colors[1],
        colors[1],
        colors[2],
        colors[2],
      ];
    }
    return {
      u_colors: {
        value: colorsArray.map((color) => [
          color[0] / 255,
          color[1] / 255,
          color[2] / 255,
        ]),
        type: "uniform3fv",
      },
      u_opacities: {
        value: opacities,
        type: "uniform1fv",
      },
      u_total_size: {
        value: totalSize,
        type: "uniform1f",
      },
      u_dot_size: {
        value: dotSize,
        type: "uniform1f",
      },
      u_reverse: {
        value: shader.includes("u_reverse_active") ? 1 : 0,
        type: "uniform1i",
      },
    };
  }, [colors, opacities, totalSize, dotSize, shader]);

  return (
    <Shader
      source={`
        precision mediump float;
        in vec2 fragCoord;

        uniform float u_time;
        uniform float u_opacities[10];
        uniform vec3 u_colors[6];
        uniform float u_total_size;
        uniform float u_dot_size;
        uniform vec2 u_resolution;
        uniform int u_reverse;

        out vec4 fragColor;

        float PHI = 1.61803398874989484820459;
        float random(vec2 xy) {
            return fract(tan(distance(xy * PHI, xy) * 0.5) * xy.x);
        }
        float map(float value, float min1, float max1, float min2, float max2) {
            return min2 + (value - min1) * (max2 - min2) / (max1 - min1);
        }

        void main() {
            vec2 st = fragCoord.xy;
            ${
              center.includes("x")
                ? "st.x -= abs(floor((mod(u_resolution.x, u_total_size) - u_dot_size) * 0.5));"
                : ""
            }
            ${
              center.includes("y")
                ? "st.y -= abs(floor((mod(u_resolution.y, u_total_size) - u_dot_size) * 0.5));"
                : ""
            }

            float opacity = step(0.0, st.x);
            opacity *= step(0.0, st.y);

            vec2 st2 = vec2(int(st.x / u_total_size), int(st.y / u_total_size));

            float frequency = 5.0;
            float show_offset = random(st2);
            float rand = random(st2 * floor((u_time / frequency) + show_offset + frequency));
            opacity *= u_opacities[int(rand * 10.0)];
            opacity *= 1.0 - step(u_dot_size / u_total_size, fract(st.x / u_total_size));
            opacity *= 1.0 - step(u_dot_size / u_total_size, fract(st.y / u_total_size));

            vec3 color = u_colors[int(show_offset * 6.0)];

            float animation_speed_factor = 0.5;
            vec2 center_grid = u_resolution / 2.0 / u_total_size;
            float dist_from_center = distance(center_grid, st2);
            float timing_offset_intro = dist_from_center * 0.01 + (random(st2) * 0.15);
            float max_grid_dist = distance(center_grid, vec2(0.0, 0.0));
            float timing_offset_outro = (max_grid_dist - dist_from_center) * 0.02 + (random(st2 + 42.0) * 0.2);

            if (u_reverse == 1) {
                float current_timing_offset = timing_offset_outro;
                opacity *= 1.0 - step(current_timing_offset, u_time * animation_speed_factor);
                opacity *= clamp((step(current_timing_offset + 0.1, u_time * animation_speed_factor)) * 1.25, 1.0, 1.25);
            } else {
                float current_timing_offset = timing_offset_intro;
                opacity *= step(current_timing_offset, u_time * animation_speed_factor);
                opacity *= clamp((1.0 - step(current_timing_offset + 0.1, u_time * animation_speed_factor)) * 1.25, 1.0, 1.25);
            }

            fragColor = vec4(color, opacity);
            fragColor.rgb *= fragColor.a;
        }`}
      uniforms={uniforms}
      maxFps={60}
    />
  );
};

/* â”€â”€ ShaderMaterial â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const ShaderMaterial = ({
  source,
  uniforms,
  maxFps = 60,
}: {
  source: string;
  hovered?: boolean;
  maxFps?: number;
  uniforms: Uniforms;
}) => {
  const { size } = useThree();
  const ref = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const timestamp = clock.getElapsedTime();
    const material: any = ref.current.material;
    material.uniforms.u_time.value = timestamp;
  });

  const getUniforms = () => {
    const preparedUniforms: any = {};
    for (const uniformName in uniforms) {
      const uniform: any = uniforms[uniformName];
      switch (uniform.type) {
        case "uniform1f":
          preparedUniforms[uniformName] = { value: uniform.value, type: "1f" };
          break;
        case "uniform1i":
          preparedUniforms[uniformName] = { value: uniform.value, type: "1i" };
          break;
        case "uniform3f":
          preparedUniforms[uniformName] = {
            value: new THREE.Vector3().fromArray(uniform.value as number[]),
            type: "3f",
          };
          break;
        case "uniform1fv":
          preparedUniforms[uniformName] = { value: uniform.value, type: "1fv" };
          break;
        case "uniform3fv":
          preparedUniforms[uniformName] = {
            value: (uniform.value as number[][]).map((v) =>
              new THREE.Vector3().fromArray(v)
            ),
            type: "3fv",
          };
          break;
        case "uniform2f":
          preparedUniforms[uniformName] = {
            value: new THREE.Vector2().fromArray(uniform.value as number[]),
            type: "2f",
          };
          break;
        default:
          console.error(`Invalid uniform type for '${uniformName}'.`);
          break;
      }
    }
    preparedUniforms["u_time"] = { value: 0, type: "1f" };
    preparedUniforms["u_resolution"] = {
      value: new THREE.Vector2(size.width * 2, size.height * 2),
    };
    return preparedUniforms;
  };

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: `
          precision mediump float;
          in vec2 coordinates;
          uniform vec2 u_resolution;
          out vec2 fragCoord;
          void main(){
            float x = position.x;
            float y = position.y;
            gl_Position = vec4(x, y, 0.0, 1.0);
            fragCoord = (position.xy + vec2(1.0)) * 0.5 * u_resolution;
            fragCoord.y = u_resolution.y - fragCoord.y;
          }
        `,
        fragmentShader: source,
        uniforms: getUniforms(),
        glslVersion: THREE.GLSL3,
        blending: THREE.CustomBlending,
        blendSrc: THREE.SrcAlphaFactor,
        blendDst: THREE.OneFactor,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [size.width, size.height, source]
  );

  return (
    <mesh ref={ref as any}>
      <planeGeometry args={[2, 2]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
};

/* â”€â”€ Shader â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const Shader: React.FC<ShaderProps> = ({ source, uniforms, maxFps = 60 }) => {
  return (
    <Canvas className="absolute inset-0 h-full w-full">
      <ShaderMaterial source={source} uniforms={uniforms} maxFps={maxFps} />
    </Canvas>
  );
};

/* â”€â”€ AnimatedNavLink â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const AnimatedNavLink = ({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) => (
  <a
    href={href}
    className="group relative inline-flex h-5 items-center overflow-hidden text-sm"
  >
    <div className="flex flex-col transition-transform duration-300 ease-out group-hover:-translate-y-1/2">
      <span className="text-gray-300">{children}</span>
      <span className="text-white">{children}</span>
    </div>
  </a>
);

/* â”€â”€ MiniNavbar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function MiniNavbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [headerShapeClass, setHeaderShapeClass] = useState("rounded-full");
  const shapeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (shapeTimeoutRef.current) clearTimeout(shapeTimeoutRef.current);
    if (isOpen) {
      setHeaderShapeClass("rounded-xl");
    } else {
      shapeTimeoutRef.current = setTimeout(
        () => setHeaderShapeClass("rounded-full"),
        300
      );
    }
    return () => {
      if (shapeTimeoutRef.current) clearTimeout(shapeTimeoutRef.current);
    };
  }, [isOpen]);

  const logoElement = (
    <div className="relative flex h-5 w-5 items-center justify-center">
      <span className="absolute left-1/2 top-0 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-gray-200 opacity-80" />
      <span className="absolute left-0 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-gray-200 opacity-80" />
      <span className="absolute right-0 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-gray-200 opacity-80" />
      <span className="absolute bottom-0 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-gray-200 opacity-80" />
    </div>
  );

  const navLinks = [
    { label: "Manifesto", href: "#" },
    { label: "Careers", href: "#" },
    { label: "Discover", href: "#" },
  ];

  const loginBtn = (
    <button className="w-full rounded-full border border-[#333] bg-[rgba(31,31,31,0.62)] px-4 py-2 text-sm text-gray-300 transition-colors hover:border-white/50 hover:text-white sm:w-auto sm:px-3 sm:text-xs">
      Log In
    </button>
  );

  const signupBtn = (
    <div className="group relative w-full sm:w-auto">
      <div className="pointer-events-none absolute -m-2 inset-0 hidden rounded-full bg-gray-100 opacity-40 blur-lg transition-all duration-300 group-hover:-m-3 group-hover:opacity-60 group-hover:blur-xl sm:block" />
      <button className="relative z-10 w-full rounded-full bg-gradient-to-br from-gray-100 to-gray-300 px-4 py-2 text-sm font-semibold text-black transition-all hover:from-gray-200 hover:to-gray-400 sm:w-auto sm:px-3 sm:text-xs">
        Sign Up
      </button>
    </div>
  );

  return (
    <header
      className={cn(
        "fixed left-1/2 top-6 z-20 flex -translate-x-1/2 flex-col items-center border border-[#333] bg-[#1f1f1f57] px-6 py-3 backdrop-blur-sm transition-[border-radius] duration-0",
        "w-[calc(100%-2rem)] sm:w-auto",
        headerShapeClass
      )}
    >
      <div className="flex w-full items-center justify-between gap-x-6 sm:gap-x-8">
        <div className="flex items-center">{logoElement}</div>

        <nav className="hidden items-center space-x-4 text-sm sm:flex sm:space-x-6">
          {navLinks.map((l) => (
            <AnimatedNavLink key={l.label} href={l.href}>
              {l.label}
            </AnimatedNavLink>
          ))}
        </nav>

        <div className="hidden items-center gap-2 sm:flex sm:gap-3">
          {loginBtn}
          {signupBtn}
        </div>

        <button
          className="flex h-8 w-8 items-center justify-center text-gray-300 focus:outline-none sm:hidden"
          onClick={() => setIsOpen((v) => !v)}
          aria-label={isOpen ? "Close Menu" : "Open Menu"}
        >
          {isOpen ? (
            <svg
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          ) : (
            <svg
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          )}
        </button>
      </div>

      <div
        className={cn(
          "flex w-full flex-col items-center overflow-hidden transition-all duration-300 ease-in-out sm:hidden",
          isOpen
            ? "max-h-[1000px] pt-4 opacity-100"
            : "pointer-events-none max-h-0 pt-0 opacity-0"
        )}
      >
        <nav className="flex w-full flex-col items-center space-y-4 text-base">
          {navLinks.map((l) => (
            <a
              key={l.label}
              href={l.href}
              className="w-full text-center text-gray-300 transition-colors hover:text-white"
            >
              {l.label}
            </a>
          ))}
        </nav>
        <div className="mt-4 flex w-full flex-col items-center space-y-4">
          {loginBtn}
          {signupBtn}
        </div>
      </div>
    </header>
  );
}

/* â”€â”€ Shared Google SVG â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const GoogleIcon = () => (
  <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden>
    <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
    <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
    <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
    <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
  </svg>
);

/* â”€â”€ OTP Code Input â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
interface OtpInputProps {
  code: string[];
  refs: React.MutableRefObject<(HTMLInputElement | null)[]>;
  onChange: (i: number, v: string) => void;
  onKeyDown: (i: number, e: React.KeyboardEvent<HTMLInputElement>) => void;
}
const OtpInput = ({ code, refs, onChange, onKeyDown }: OtpInputProps) => (
  <div className="relative rounded-full border border-white/10 px-5 py-4">
    <div className="flex items-center justify-center">
      {code.map((digit, i) => (
        <div key={i} className="flex items-center">
          <div className="relative">
            <input
              ref={(el) => { refs.current[i] = el; }}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={1}
              value={digit}
              onChange={(e) => onChange(i, e.target.value)}
              onKeyDown={(e) => onKeyDown(i, e)}
              className="w-8 appearance-none border-none bg-transparent text-center text-xl text-white focus:outline-none focus:ring-0"
              style={{ caretColor: "transparent" }}
            />
            {!digit && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <span className="text-xl text-white/20">•</span>
              </div>
            )}
          </div>
          {i < 5 && <span className="text-xl text-white/20">|</span>}
        </div>
      ))}
    </div>
  </div>
);

/* â”€â”€ Legal text â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const LegalText = () => (
  <p className="text-xs text-white/40">
    By continuing, you agree to our{" "}
    <Link href="/terms" className="underline transition-colors hover:text-white/60">Terms</Link>,{" "}
    <Link href="/privacy" className="underline transition-colors hover:text-white/60">Privacy Policy</Link>, and{" "}
    <Link href="/cookies" className="underline transition-colors hover:text-white/60">Cookie Notice</Link>.
  </p>
);

/* â”€â”€ Tab Switcher â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
interface TabSwitcherProps {
  active: "signin" | "signup";
  onChange: (tab: "signin" | "signup") => void;
}
const TabSwitcher = ({ active, onChange }: TabSwitcherProps) => (
  <div
    className="relative mb-7 flex w-full items-center rounded-2xl border border-white/10 bg-black/30 p-1.5 shadow-inner shadow-black/30"
    role="tablist"
    aria-label="Choose an authentication method"
  >
    {/* sliding pill */}
    <motion.div
      layout
      layoutId="auth-tab-pill"
      className="absolute h-[calc(100%-12px)] rounded-xl bg-white shadow-[0_8px_24px_rgba(255,255,255,0.12)]"
      style={{
        width: "calc(50% - 6px)",
        left: active === "signin" ? 6 : "calc(50%)",
      }}
      transition={{ type: "spring", stiffness: 400, damping: 35 }}
    />
    {(["signin", "signup"] as const).map((tab) => (
      <button
        key={tab}
        type="button"
        role="tab"
        aria-selected={active === tab}
        onClick={() => onChange(tab)}
        className={cn(
          "relative z-10 flex-1 rounded-xl py-2.5 text-sm font-semibold transition-colors duration-300",
          active === tab ? "text-black" : "text-white/50 hover:text-white/80"
        )}
      >
        {tab === "signin" ? "Sign In" : "Sign Up"}
      </button>
    ))}
  </div>
);

/* â”€â”€ SignInPage â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
export const SignInPage = ({ className, initialTab = "signin" }: SignInPageProps) => {
  /* â”€â”€ Tab state â”€â”€ */
  const [activeTab, setActiveTab] = useState<"signin" | "signup">(initialTab);

  /* â”€â”€ Shared step state (used by both flows) â”€â”€ */
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");          // Sign Up only
  const [password, setPassword] = useState("");  // Sign In only
  const [step, setStep] = useState<"form" | "code" | "success">("form");
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const codeInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  /* â”€â”€ Canvas animation state â”€â”€ */
  const [initialCanvasVisible, setInitialCanvasVisible] = useState(true);
  const [reverseCanvasVisible, setReverseCanvasVisible] = useState(false);

  /* â”€â”€ Switch tabs â†’ reset everything â”€â”€ */
  const handleTabChange = (tab: "signin" | "signup") => {
    setActiveTab(tab);
    setStep("form");
    setEmail("");
    setName("");
    setPassword("");
    setCode(["", "", "", "", "", ""]);
    setReverseCanvasVisible(false);
    setInitialCanvasVisible(true);
  };

  /* â”€â”€ Form submit (both tabs) â”€â”€ */
  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    if (activeTab === "signup" && !name) return;
    const path = activeTab === "signup" ? "/auth/sign-up" : "/auth/sign-in";
    window.location.assign(`${path}?email=${encodeURIComponent(email)}`);
  };

  const handleHostedAuth = () => {
    const path = activeTab === "signup" ? "/auth/sign-up" : "/auth/sign-in";
    window.location.assign(path);
  };

  /* â”€â”€ Focus OTP when step changes â”€â”€ */
  useEffect(() => {
    if (step === "code") {
      setTimeout(() => codeInputRefs.current[0]?.focus(), 500);
    }
  }, [step]);

  /* â”€â”€ OTP digit change â”€â”€ */
  const handleCodeChange = (index: number, value: string) => {
    if (value.length > 1) return;
    const newCode = [...code];
    newCode[index] = value;
    setCode(newCode);
    if (value && index < 5) codeInputRefs.current[index + 1]?.focus();
    if (index === 5 && value && newCode.every((d) => d.length === 1)) {
      setReverseCanvasVisible(true);
      setTimeout(() => setInitialCanvasVisible(false), 50);
      setTimeout(() => setStep("success"), 2000);
    }
  };

  const handleKeyDown = (
    index: number,
    e: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (e.key === "Backspace" && !code[index] && index > 0) {
      codeInputRefs.current[index - 1]?.focus();
    }
  };

  const handleBackClick = () => {
    setStep("form");
    setCode(["", "", "", "", "", ""]);
    setReverseCanvasVisible(false);
    setInitialCanvasVisible(true);
  };

  /* â”€â”€ Arrow submit button â”€â”€ */
  const ArrowSubmit = () => (
    <button
      type="submit"
      className="group absolute right-1.5 top-1.5 flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
    >
      <span className="relative block h-full w-full overflow-hidden">
        <span className="absolute inset-0 flex items-center justify-center transition-transform duration-300 group-hover:translate-x-full">→</span>
        <span className="absolute inset-0 flex -translate-x-full items-center justify-center transition-transform duration-300 group-hover:translate-x-0">→</span>
      </span>
    </button>
  );

  return (
    <div className={cn("relative flex min-h-screen w-full flex-col bg-black", className)}>

      {/* â”€â”€ Background canvas â”€â”€ */}
      <div className="absolute inset-0 z-0">
        {initialCanvasVisible && (
          <div className="absolute inset-0">
            <CanvasRevealEffect animationSpeed={3} containerClassName="bg-black"
              colors={[[255, 255, 255], [255, 255, 255]]} dotSize={6} reverse={false} />
          </div>
        )}
        {reverseCanvasVisible && (
          <div className="absolute inset-0">
            <CanvasRevealEffect animationSpeed={4} containerClassName="bg-black"
              colors={[[255, 255, 255], [255, 255, 255]]} dotSize={6} reverse={true} />
          </div>
        )}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(0,0,0,1)_0%,_transparent_100%)]" />
        <div className="absolute left-0 right-0 top-0 h-1/3 bg-gradient-to-b from-black to-transparent" />
      </div>

      {/* â”€â”€ Foreground â”€â”€ */}
      <div className="relative z-10 flex flex-1 flex-col">
        <div className="hidden" aria-hidden>
          <MiniNavbar />
        </div>
        <Link
          href="/"
          aria-label="Back to home"
          className="fixed left-6 top-6 z-20 flex items-center gap-2.5 rounded-full border border-white/10 bg-black/30 px-3 py-2 text-sm font-medium text-white/70 backdrop-blur-xl transition-colors hover:border-white/20 hover:text-white sm:left-8 sm:top-8"
        >
          <span className="relative flex h-5 w-5 items-center justify-center" aria-hidden>
            <span className="absolute left-1/2 top-0 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-white/80" />
            <span className="absolute left-0 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-white/80" />
            <span className="absolute right-0 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-white/80" />
            <span className="absolute bottom-0 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-white/80" />
          </span>
          <span>YourSign</span>
        </Link>

        <div className="flex flex-1 items-center justify-center px-4 pb-8 pt-24 sm:px-6 sm:pt-28">
          <div className="grid w-full max-w-5xl overflow-hidden rounded-[2rem] border border-white/[0.12] bg-[#090909]/85 shadow-[0_30px_100px_rgba(0,0,0,0.65)] backdrop-blur-2xl lg:min-h-[620px] lg:grid-cols-[0.95fr_1.05fr]">
            <section className="flex flex-col justify-center p-5 sm:p-8 lg:p-12">

              {/* â•â• TAB SWITCHER â€” only shown on "form" step â•â• */}
              <AnimatePresence>
                {step === "form" && (
                  <motion.div
                    key="tabs"
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.25 }}
                  >
                    <TabSwitcher active={activeTab} onChange={handleTabChange} />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* â•â• CARDS â•â• */}
              <AnimatePresence mode="wait">

                {/* â”€â”€ Sign In â€” email+password form â”€â”€ */}
                {step === "form" && activeTab === "signin" && (
                  <motion.div
                    key="signin-form"
                    initial={{ opacity: 0, x: -60 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -60 }}
                    transition={{ duration: 0.35, ease: "easeOut" }}
                    className="space-y-6 text-center"
                  >
                    <div className="space-y-1">
                      <h1 className="text-[2.5rem] font-bold leading-[1.1] tracking-tight text-white">
                        Welcome back
                      </h1>
                      <p className="text-[1.25rem] font-light text-white/60">
                        Sign in to your account
                      </p>
                    </div>

                    <div className="space-y-3">
                      <button type="button" onClick={handleHostedAuth} className="flex w-full items-center justify-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-3 text-white backdrop-blur-sm transition-colors hover:bg-white/10">
                        <GoogleIcon />
                        <span>Continue with Google</span>
                      </button>

                      <div className="flex items-center gap-3">
                        <div className="h-px flex-1 bg-white/10" />
                        <span className="text-xs text-white/40">or</span>
                        <div className="h-px flex-1 bg-white/10" />
                      </div>

                      <form onSubmit={handleFormSubmit} className="space-y-3">
                        <div className="relative">
                          <input
                            type="email"
                            placeholder="your@email.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full rounded-full border border-white/10 bg-transparent py-3 pl-4 pr-12 text-center text-white backdrop-blur-sm focus:border-white/30 focus:outline-none"
                            required
                          />
                          <ArrowSubmit />
                        </div>
                      </form>
                    </div>

                    <div className="pt-6"><LegalText /></div>
                  </motion.div>
                )}

                {/* â”€â”€ Sign Up â€” name + email form â”€â”€ */}
                {step === "form" && activeTab === "signup" && (
                  <motion.div
                    key="signup-form"
                    initial={{ opacity: 0, x: 60 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 60 }}
                    transition={{ duration: 0.35, ease: "easeOut" }}
                    className="space-y-6 text-center"
                  >
                    <div className="space-y-1">
                      <h1 className="text-[2.5rem] font-bold leading-[1.1] tracking-tight text-white">
                        Create account
                      </h1>
                      <p className="text-[1.25rem] font-light text-white/60">
                        Start signing in seconds
                      </p>
                    </div>

                    <div className="space-y-3">
                      <button type="button" onClick={handleHostedAuth} className="flex w-full items-center justify-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-3 text-white backdrop-blur-sm transition-colors hover:bg-white/10">
                        <GoogleIcon />
                        <span>Sign up with Google</span>
                      </button>

                      <div className="flex items-center gap-3">
                        <div className="h-px flex-1 bg-white/10" />
                        <span className="text-xs text-white/40">or</span>
                        <div className="h-px flex-1 bg-white/10" />
                      </div>

                      <form onSubmit={handleFormSubmit} className="space-y-3">
                        {/* Name */}
                        <input
                          type="text"
                          placeholder="Full name"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          className="w-full rounded-full border border-white/10 bg-transparent py-3 px-4 text-center text-white backdrop-blur-sm focus:border-white/30 focus:outline-none"
                          required
                        />
                        {/* Email + submit arrow */}
                        <div className="relative">
                          <input
                            type="email"
                            placeholder="your@email.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full rounded-full border border-white/10 bg-transparent py-3 pl-4 pr-12 text-center text-white backdrop-blur-sm focus:border-white/30 focus:outline-none"
                            required
                          />
                          <ArrowSubmit />
                        </div>
                      </form>
                    </div>

                    <div className="pt-4"><LegalText /></div>
                  </motion.div>
                )}

                {/* â”€â”€ OTP Code step (shared) â”€â”€ */}
                {step === "code" && (
                  <motion.div
                    key="code-step"
                    initial={{ opacity: 0, x: 100 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 100 }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                    className="space-y-6 text-center"
                  >
                    <div className="space-y-1">
                      <h1 className="text-[2.5rem] font-bold leading-[1.1] tracking-tight text-white">
                        Check your inbox
                      </h1>
                      <p className="text-[1.25rem] font-light text-white/50">
                        Code sent to{" "}
                        <span className="text-white/80">{email}</span>
                      </p>
                    </div>

                    <OtpInput
                      code={code}
                      refs={codeInputRefs}
                      onChange={handleCodeChange}
                      onKeyDown={handleKeyDown}
                    />

                    <motion.p
                      className="cursor-pointer text-sm text-white/50 transition-colors hover:text-white/70"
                      whileHover={{ scale: 1.02 }}
                    >
                      Resend code
                    </motion.p>

                    <div className="flex w-full gap-3">
                      <motion.button
                        onClick={handleBackClick}
                        className="w-[30%] rounded-full bg-white px-8 py-3 font-medium text-black transition-colors hover:bg-white/90"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        Back
                      </motion.button>
                      <motion.button
                        className={cn(
                          "flex-1 rounded-full border py-3 font-medium transition-all duration-300",
                          code.every((d) => d !== "")
                            ? "cursor-pointer border-transparent bg-white text-black hover:bg-white/90"
                            : "cursor-not-allowed border-white/10 bg-[#111] text-white/50"
                        )}
                        disabled={!code.every((d) => d !== "")}
                      >
                        Verify
                      </motion.button>
                    </div>

                    <div className="pt-8"><LegalText /></div>
                  </motion.div>
                )}

                {/* â”€â”€ Success step (shared) â”€â”€ */}
                {step === "success" && (
                  <motion.div
                    key="success-step"
                    initial={{ opacity: 0, y: 50 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, ease: "easeOut", delay: 0.3 }}
                    className="space-y-6 text-center"
                  >
                    <div className="space-y-1">
                      <h1 className="text-[2.5rem] font-bold leading-[1.1] tracking-tight text-white">
                        {activeTab === "signup" ? "Account created!" : "You're in!"}
                      </h1>
                      <p className="text-[1.25rem] font-light text-white/50">
                        {activeTab === "signup"
                          ? `Welcome, ${name || "there"} 👋`
                          : "Welcome back to YourSign"}
                      </p>
                    </div>

                    <motion.div
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ duration: 0.5, delay: 0.5 }}
                      className="py-10"
                    >
                      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-white to-white/70 shadow-[0_0_40px_rgba(255,255,255,0.3)]">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-black" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      </div>
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 1 }}
                    >
                      <Link
                        href="/dashboard"
                        className="block w-full rounded-full bg-white py-3 text-center font-medium text-black transition-colors hover:bg-white/90"
                      >
                        Continue to Dashboard
                      </Link>
                    </motion.div>
                  </motion.div>
                )}

              </AnimatePresence>
            </section>

            <aside className="relative hidden overflow-hidden border-l border-blue-300/15 bg-gradient-to-br from-blue-950/70 via-blue-900/35 to-[#090909] lg:flex lg:flex-col lg:justify-between lg:p-12">
              <div className="pointer-events-none absolute inset-0 opacity-60">
                <div className="absolute -right-16 -top-16 h-72 w-72 rounded-full bg-blue-400/30 blur-3xl" />
                <div className="absolute -bottom-28 -left-20 h-80 w-80 rounded-full bg-cyan-400/15 blur-3xl" />
                <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:32px_32px] [mask-image:linear-gradient(to_bottom,black,transparent)]" />
              </div>

              <div className="relative z-10">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/45">
                  Secure by design
                </p>
                <h2 className="mt-5 max-w-sm text-4xl font-semibold leading-tight tracking-[-0.04em] text-white">
                  Every agreement, moving forward.
                </h2>
                <p className="mt-4 max-w-md text-base leading-7 text-white/55">
                  Send, sign, and manage important documents in one calm, trusted workspace.
                </p>
              </div>

              <div className="relative z-10 rounded-3xl border border-white/10 bg-black/30 p-6 backdrop-blur-xl">
                <div className="mb-8 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-white/40">Document status</p>
                    <p className="mt-1 font-medium text-white">Partnership agreement</p>
                  </div>
                  <span className="rounded-full border border-blue-300/30 bg-blue-300/15 px-3 py-1 text-xs font-medium text-blue-100">
                    Completed
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full w-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-300 shadow-[0_0_18px_rgba(59,130,246,0.55)]" />
                </div>
                <div className="mt-5 flex items-center justify-between text-xs text-white/40">
                  <span>3 of 3 signatures</span>
                  <span>Protected &amp; verified</span>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
};
