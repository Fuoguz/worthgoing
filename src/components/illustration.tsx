import type { Illustration as IllustrationType } from "@/lib/types";
/** Original local editorial illustrations. No remote image requests. */
export function Illustration({
  kind = "canal",
  hero = false,
}: {
  kind?: IllustrationType;
  hero?: boolean;
}) {
  const grain = `grain-${hero ? "hero" : kind}`;
  return (
    <svg
      viewBox="0 0 640 420"
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label={
        hero
          ? "An illustrated London afternoon beside the canal"
          : `${kind} activity illustration`
      }
      className={`scene scene-${kind}`}
    >
      <defs>
        <pattern id={grain} width="7" height="7" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="2" r=".6" fill="#24382d" opacity=".12" />
          <circle cx="5" cy="6" r=".4" fill="#fff" opacity=".3" />
        </pattern>
      </defs>
      {kind === "canal" && (
        <>
          <rect width="640" height="420" fill="#e4eddd" />
          <circle cx="485" cy="95" r="48" fill="#f3c866" />
          <path
            d="M0 238L0 143 70 143 70 118 124 118 124 190 177 190 177 126 205 105 233 126 233 190 291 190 291 153 340 153 340 247Z"
            fill="#bdc8b6"
          />
          <path d="M375 260V159h112v101M484 260V200h121v60" fill="#ce8c68" />
          <path d="M363 160h136l-25-34h-82Z" fill="#7e755e" />
          {[394, 430, 465].map((x) => (
            <g key={x}>
              <rect
                x={x}
                y="179"
                width="14"
                height="25"
                rx="7"
                fill="#f0d8b8"
              />
              <rect x={x} y="218" width="14" height="25" fill="#f0d8b8" />
            </g>
          ))}
          <path d="M0 270Q130 220 270 259T640 244V420H0Z" fill="#79978a" />
          <path
            d="M0 330Q125 281 298 314T640 305M30 380Q220 334 440 375M309 277l71 8m90 50 68-5"
            fill="none"
            stroke="#bfd0bc"
            strokeWidth="3"
          />
          <path
            d="M0 240Q108 238 183 293T427 420H640Q464 322 398 276T0 205Z"
            fill="#e8d9b8"
          />
          <path
            d="M0 240Q108 238 183 293T427 420"
            fill="none"
            stroke="#f3ead3"
            strokeWidth="9"
          />
          <path
            d="M70 229v-64m0 33-25-22m25 13 29-33"
            stroke="#47654e"
            strokeWidth="9"
          />
          <ellipse cx="62" cy="143" rx="58" ry="63" fill="#5d7d51" />
          <ellipse cx="92" cy="137" rx="35" ry="42" fill="#6d8c5a" />
          <path d="M548 306V153" stroke="#536d45" strokeWidth="12" />
          <ellipse cx="550" cy="143" rx="62" ry="80" fill="#547348" />
          <ellipse cx="580" cy="117" rx="36" ry="44" fill="#698354" />
          <g transform="translate(292 277)">
            <circle r="10" fill="#c28761" />
            <path d="M-9 14h19l9 36h-38Z" fill="#ef8556" />
            <path
              d="M-6 50-8 84m14-34 12 32"
              stroke="#334c41"
              strokeWidth="9"
              strokeLinecap="round"
            />
            <path
              d="m-10 20-18 21m38-23 13 21"
              stroke="#c28761"
              strokeWidth="7"
              strokeLinecap="round"
            />
          </g>
          <g transform="translate(337 294)">
            <circle r="9" fill="#7e543f" />
            <path d="M-8 14h17l8 34h-32Z" fill="#f4e8ce" />
            <path
              d="M-5 48-6 78m12-30 10 26"
              stroke="#55694a"
              strokeWidth="8"
              strokeLinecap="round"
            />
          </g>
          <g transform="translate(109 304) rotate(9)">
            <path d="M0 0h117l-17 22H18Z" fill="#304e45" />
            <rect x="17" y="-21" width="77" height="22" rx="5" fill="#c77557" />
            <rect x="28" y="-15" width="16" height="10" fill="#e7d9bd" />
            <rect x="54" y="-15" width="16" height="10" fill="#e7d9bd" />
          </g>
          <path
            d="m290 80 12-5 12 5m29 13 11-5 11 5"
            stroke="#718477"
            strokeWidth="2"
            fill="none"
          />
        </>
      )}
      {kind === "gallery" && (
        <>
          <rect width="640" height="420" fill="#e7dccc" />
          <path d="M0 330h640v90H0Z" fill="#cab7a0" />
          <path d="M0 0h115v330H0m525-330h115v330H525" fill="#d6c6b2" />
          <rect x="152" y="65" width="337" height="231" fill="#f3ecdf" />
          <rect x="165" y="78" width="311" height="205" fill="#ad694e" />
          <path d="M165 283V158Q226 85 310 151T476 109V283Z" fill="#354e46" />
          <circle cx="384" cy="139" r="48" fill="#e5b575" />
          <path d="M237 283q-44-88 25-140l49 140" fill="#e6cba8" />
          <g transform="translate(343 289)">
            <circle r="13" fill="#725241" />
            <path d="M-13 19h27l12 52h-52Z" fill="#576952" />
            <path d="M-8 71v54m20-54 10 54" stroke="#3e4138" strokeWidth="13" />
          </g>
          <path
            d="M71 341h116v10H71m10 0v28m95-28v28"
            stroke="#5e574a"
            strokeWidth="9"
          />
          <rect x="496" y="266" width="23" height="4" fill="#9b8b73" />
        </>
      )}
      {kind === "market" && (
        <>
          <rect width="640" height="420" fill="#efdcb6" />
          <rect y="320" width="640" height="100" fill="#c7b89a" />
          <path d="M0 53h640v178H0Z" fill="#d6ad86" />
          {[35, 143, 475, 580].map((x) => (
            <g key={x}>
              <rect x={x} y="82" width="44" height="72" fill="#8c9a86" />
              <path
                d={`M${x} 117h44m-22-35v72`}
                stroke="#f0dfbb"
                strokeWidth="5"
              />
            </g>
          ))}
          <rect x="92" y="216" width="422" height="124" fill="#4b6b53" />
          <path d="m66 211 27-79h421l28 79Z" fill="#f2e5c6" />
          {[105, 180, 255, 330, 405, 480].map((x) => (
            <path key={x} d={`M${x} 132h37l12 79h-55Z`} fill="#b5674f" />
          ))}
          <rect x="112" y="286" width="380" height="21" fill="#b89b71" />
          {[138, 211, 284, 357, 430].map((x, i) => (
            <g key={x}>
              <rect x={x} y="260" width="52" height="27" fill="#dac493" />
              <circle
                cx={x + 15}
                cy="258"
                r="13"
                fill={i % 2 ? "#bd6c41" : "#8b9b54"}
              />
              <circle
                cx={x + 35}
                cy="256"
                r="14"
                fill={i % 2 ? "#d48b4c" : "#5b7c49"}
              />
            </g>
          ))}
          <g transform="translate(376 309)">
            <circle r="12" fill="#79513d" />
            <path d="m-13 18 27 0 10 48h-48Z" fill="#e9b456" />
            <path d="M-7 66v43m16-43 9 43" stroke="#465c4b" strokeWidth="11" />
          </g>
          <path
            d="M55 335V235m0 41-22-13m22 0 26-24"
            stroke="#56744c"
            strokeWidth="8"
          />
          <circle cx="51" cy="224" r="37" fill="#788c56" />
        </>
      )}
      {kind === "jazz" && (
        <>
          <rect width="640" height="420" fill="#344b4b" />
          <path d="M0 0h640v46H0Z" fill="#263c3c" />
          <path d="m235 46-113 282h400L401 46" fill="#e3b265" opacity=".18" />
          <path d="M0 330h640v90H0Z" fill="#273d3c" />
          <path
            d="M122 48v234m28-234v234m338-234v234m29-234v234"
            stroke="#766657"
            strokeWidth="17"
          />
          <g transform="translate(273 182)">
            <circle r="19" fill="#bc916d" />
            <path d="M-20 27h40l24 91h-83Z" fill="#d7c7a6" />
            <path
              d="m-10 118-16 56m43-56 20 56"
              stroke="#1e3331"
              strokeWidth="17"
            />
            <path d="m19 33 47 57" stroke="#bc916d" strokeWidth="12" />
            <path
              d="M23 17q38 14 48 52t-4 62q-36 15-41-13"
              fill="none"
              stroke="#dbac58"
              strokeWidth="15"
            />
            <path d="m9 11 21 8" stroke="#dbac58" strokeWidth="5" />
          </g>
          <g fill="#1e3331">
            <ellipse cx="87" cy="372" rx="58" ry="46" />
            <circle cx="84" cy="326" r="24" />
            <ellipse cx="535" cy="384" rx="73" ry="54" />
            <circle cx="527" cy="330" r="29" />
            <ellipse cx="424" cy="424" rx="72" ry="42" />
          </g>
          <path d="M378 285h103m-51-1v69" stroke="#b7a47b" strokeWidth="5" />
          <ellipse cx="430" cy="281" rx="58" ry="8" fill="#c6af71" />
        </>
      )}
      {kind === "cinema" && (
        <>
          <rect width="640" height="420" fill="#a7a4ad" />
          <circle cx="494" cy="93" r="41" fill="#e9c19a" />
          <path
            d="M0 251v-66h44v-31h45v92h47v-69h64v58h42v-90h35v-35h35v149h47v-68h62v68h40v-109h47v-30h34v141h58v-69h45v86Z"
            fill="#6f7880"
          />
          <rect y="284" width="640" height="136" fill="#59656b" />
          <rect x="120" y="80" width="325" height="225" fill="#ece2ce" />
          <rect x="130" y="90" width="305" height="205" fill="#d6baa5" />
          <path d="M130 295V228l71-63 92 72 67-99 75 90v67Z" fill="#8b9b89" />
          <circle cx="256" cy="145" r="33" fill="#f6deae" />
          {[63, 210, 355, 510].map((x, i) => (
            <g key={x} transform={`translate(${x} ${i % 2 ? 343 : 363})`}>
              <path d="M0 0h76l-20 43H20Z" fill="#d8bf99" />
              <path
                d="m3 3 45 63m26-63L23 66"
                stroke="#c7ac84"
                strokeWidth="5"
              />
              <circle cx="38" cy="-8" r="13" fill="#334747" />
              <path d="M20 5h35l-4 21H22Z" fill="#334747" />
            </g>
          ))}
          <path
            d="M0 63q290 73 640-2"
            stroke="#455459"
            strokeWidth="2"
            fill="none"
          />
          {[20, 102, 188, 279, 375, 480, 584].map((x, i) => (
            <circle
              key={x}
              cx={x}
              cy={70 + Math.sin(i / 2) * 25}
              r="5"
              fill="#f3d7a1"
            />
          ))}
        </>
      )}
      <rect width="640" height="420" fill={`url(#${grain})`} />
    </svg>
  );
}
