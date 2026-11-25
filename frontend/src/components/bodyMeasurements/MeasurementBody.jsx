const zones = {
  neck: "M44 42 Q55 45 66 42",
  shoulders: "M23 59 Q55 65 87 59",
  chest: "M31 75 Q55 82 79 75",
  arm: "M80 96 L92 91",
  waist: "M35 109 Q55 114 75 109",
  glutes: "M31 136 Q55 146 79 136",
  thigh: "M32 165 Q42 169 52 166",
  calf: "M60 222 Q69 226 77 223",
};

export default function MeasurementBody({ back, active }) {
  return (
    <svg viewBox="0 0 110 280" role="img" aria-label={back ? "Тело со спины" : "Тело спереди"}
      className="h-full max-h-[22rem] w-full overflow-visible">
      <g fill="#354953" stroke="#677f8c" strokeWidth="1.25" strokeLinejoin="round">
        <path d="M40 17Q42 5 55 5T70 17L69 29Q67 36 63 38L64 45Q70 49 79 51Q91 54 94 75L100 105 106 131Q108 140 103 145L97 139 89 116 82 90 75 111Q74 121 79 132Q83 145 80 170L76 199Q81 215 75 237L71 254 72 260 79 266Q82 270 75 272H62Q58 270 60 258L60 229Q56 218 59 199L55 160 51 199Q54 218 50 229L50 258Q52 270 48 272H35Q28 270 31 266L38 260 39 254 35 237Q29 215 34 199L30 170Q27 145 31 132Q36 121 35 111L28 90 21 116 13 139 7 145Q2 140 4 131L10 105 16 75Q19 54 31 51Q40 49 46 45L47 38Q43 36 41 29Z" />
      </g>
      <g fill="#48606c" stroke="#253944" strokeWidth="1.5">
        {back ? <>
          <path d="M28 59Q44 56 52 47V108Q43 96 36 88Z M82 59Q66 56 58 47V108Q67 96 74 88Z" />
          <path d="M36 111Q47 104 53 112V148Q42 151 32 141Z M74 111Q63 104 57 112V148Q68 151 78 141Z" />
        </> : <>
          <path d="M30 68Q40 61 53 64V85Q39 91 29 79Z M80 68Q70 61 57 64V85Q71 91 81 79Z" />
          <path d="M39 91Q44 87 53 90V125Q44 124 39 113Z M71 91Q66 87 57 90V125Q66 124 71 113Z" />
        </>}
        <path d="M19 73Q27 71 29 81L23 102Q18 105 15 100Z M91 73Q83 71 81 81L87 102Q92 105 95 100Z" />
        <path d="M33 150Q44 144 51 154L47 188Q42 198 37 187Z M77 150Q66 144 59 154L63 188Q68 198 73 187Z" />
        <path d="M36 211Q40 201 47 208Q51 220 42 240Q36 235 36 211Z M74 211Q70 201 63 208Q59 220 68 240Q74 235 74 211Z" />
      </g>
      {Object.entries(zones).map(([key, path]) => (
        <path key={key} data-zone={key} d={path} fill="none" stroke="#ffc988" strokeLinecap="round"
          strokeWidth={key === active ? 3.5 : 1.5} opacity={key === active ? 1 : 0.5} />
      ))}
    </svg>
  );
}
