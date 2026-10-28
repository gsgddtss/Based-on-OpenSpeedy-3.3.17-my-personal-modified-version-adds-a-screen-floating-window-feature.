import { useState, useEffect } from "react";
import { Box, Typography, AppBar, Toolbar, CircularProgress } from "@mui/material";
import DeveloperBoardIcon from "@mui/icons-material/DeveloperBoard";
import MinusIcon from "@mui/icons-material/Remove";
import CropSquareIcon from "@mui/icons-material/CropSquare";
import CloseIcon from "@mui/icons-material/Close";
import { getCurrentWindow } from "@tauri-apps/api/window";

const STATS_BREAKPOINT = 720;

interface TitleBarProps {
  osVer: string;
  cpuPct: number;
  memPct: number;
  gpuName: string;
  gpuUsedMb: number;
  gpuTotalMb: number;
}

function fmtGpuMb(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb} MB`;
}

export default function TitleBar({ osVer, cpuPct, memPct, gpuName, gpuUsedMb, gpuTotalMb }: TitleBarProps) {
  const [wide, setWide] = useState(window.innerWidth >= STATS_BREAKPOINT);

  useEffect(() => {
    const onResize = () => setWide(window.innerWidth >= STATS_BREAKPOINT);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return (
    <AppBar position="static" elevation={0}
      sx={{ bgcolor: "background.paper", borderBottom: 1, borderColor: "divider", color: "text.primary" }}>
      <Toolbar variant="dense" sx={{ gap: 1.5, minHeight: 48, pr: "0 !important" }}
        data-tauri-drag-region>
        <DeveloperBoardIcon sx={{ color: "primary.main", fontSize: 20, flexShrink: 0 }} />
        <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 500, flexShrink: 0 }}>{osVer}</Typography>
        <Box sx={{ flex: 1, minWidth: 0 }} />

        {wide && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, overflow: "hidden", minWidth: 0, flexShrink: 1 }}>
            <StatBadge value={cpuPct} label="CPU" />
            <StatBadge value={memPct} label="RAM" />
            {gpuName && <GPUStat name={gpuName} usedMb={gpuUsedMb} totalMb={gpuTotalMb} />}
          </Box>
        )}

        <Box sx={{ display: "flex", height: 48, ml: 1, flexShrink: 0, "& > div": { width: 46, display: "flex", alignItems: "center", justifyContent: "center", cursor: "default", "&:hover": { bgcolor: "action.hover" } } }}>
          <Box onClick={() => getCurrentWindow().minimize()}>
            <MinusIcon sx={{ fontSize: 16, color: "text.secondary" }} />
          </Box>
          <Box onClick={() => getCurrentWindow().toggleMaximize()}>
            <CropSquareIcon sx={{ fontSize: 14, color: "text.secondary" }} />
          </Box>
          {/* `close()`, not `hide()`: it raises CloseRequested, which is where
              the hide-to-tray setting is applied. Hiding directly here would
              skip that decision entirely and make the setting do nothing. */}
          <Box onClick={() => getCurrentWindow().close()} sx={{ "&:hover": { bgcolor: "#C42B1C !important", "& .MuiSvgIcon-root": { color: "#fff" } } }}>
            <CloseIcon sx={{ fontSize: 16, color: "text.secondary" }} />
          </Box>
        </Box>
      </Toolbar>
    </AppBar>
  );
}

function GPUStat({ name, usedMb, totalMb }: { name: string; usedMb: number; totalMb: number }) {
  const pct = totalMb > 0 ? (usedMb / totalMb) * 100 : 0;
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.8, mr: 0.5, flexShrink: 1, minWidth: 0 }}>
      <Box sx={{ position: "relative", display: "inline-flex", flexShrink: 0 }}>
        <CircularProgress variant="determinate" value={100} size={28} thickness={5} sx={{ color: "divider" }} />
        <CircularProgress variant="determinate" value={pct} size={28} thickness={5}
          sx={{ position: "absolute", left: 0, color: pct > 80 ? "error.main" : pct > 60 ? "warning.main" : "secondary.main" }} />
      </Box>
      <Box sx={{ minWidth: 0, overflow: "hidden" }}>
        <Typography variant="caption" sx={{ fontWeight: 600, fontSize: "0.7rem", lineHeight: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 70 }}>{name}</Typography>
        <Typography variant="caption" sx={{ color: "text.disabled", fontSize: "0.6rem", display: "block", lineHeight: 1 }}>{fmtGpuMb(usedMb)} / {fmtGpuMb(totalMb)}</Typography>
      </Box>
    </Box>
  );
}

function StatBadge({ value, label }: { value: number; label: string }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.8, mr: 0.5, flexShrink: 1, minWidth: 0 }}>
      <Box sx={{ position: "relative", display: "inline-flex" }}>
        <CircularProgress variant="determinate" value={100} size={28} thickness={5} sx={{ color: "divider" }} />
        <CircularProgress variant="determinate" value={value} size={28} thickness={5}
          sx={{ position: "absolute", left: 0, color: value > 80 ? "error.main" : value > 60 ? "warning.main" : "primary.main" }} />
      </Box>
      <Box>
        <Typography variant="caption" sx={{ fontWeight: 600, fontSize: "0.7rem", lineHeight: 1 }}>{value.toFixed(0)}%</Typography>
        <Typography variant="caption" sx={{ color: "text.disabled", fontSize: "0.6rem", display: "block", lineHeight: 1 }}>{label}</Typography>
      </Box>
    </Box>
  );
}
