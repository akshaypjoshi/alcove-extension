import { useEffect, useState } from "react";
import Drawer from "@/components/newtab/Drawer";
import { getTool, type ToolDef } from "@/lib/tools";

export default function ToolDrawer({
  toolId,
  onClose,
}: {
  toolId: string | null;
  onClose: () => void;
}) {
  const tool = toolId ? getTool(toolId) : undefined;

  // Hold on to the last tool through the close animation. Reading straight
  // from `toolId` would blank the header and swap in the wrong close button
  // for the 300ms the drawer spends sliding out.
  const [shown, setShown] = useState<ToolDef | undefined>(tool);
  useEffect(() => {
    if (tool) setShown(tool);
  }, [tool]);

  return (
    <Drawer
      open={Boolean(tool)}
      onClose={onClose}
      title={shown?.label}
      description={shown?.description}
    >
      {/* A column flex container, so a tool can claim the leftover height
          with `flex-1` (the scratchpad does) instead of leaving a tall
          drawer two-thirds empty. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4">
        {/* Keyed on id so switching tools remounts instead of reusing the
            previous tool's state. Unmounted when closed, so nothing keeps
            ticking or polling behind a hidden panel. */}
        {tool && <tool.Component key={tool.id} />}
      </div>
    </Drawer>
  );
}
