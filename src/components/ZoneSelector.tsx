import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toNodeFilterValue } from "@/lib/zone-filter-utils";
import type { ZoneSummary, ZoneFilterValue } from "@/types/zone";

interface ZoneSelectorProps {
  value: ZoneFilterValue;
  onChange: (value: ZoneFilterValue) => void;
  zones: ZoneSummary[];
  /** Nodes with readings that are not in any zone (for single-node picks). */
  unassignedNodeIds: string[];
  disabled?: boolean;
  className?: string;
}

export function ZoneSelector({
  value,
  onChange,
  zones,
  unassignedNodeIds,
  disabled,
  className,
}: ZoneSelectorProps) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <span className="text-sm font-medium text-muted-foreground">View</span>
      <Select
        value={value}
        onValueChange={(v) => onChange(v as ZoneFilterValue)}
        disabled={disabled}
      >
        <SelectTrigger className="w-full min-w-0 max-w-full overflow-hidden md:max-w-[min(100%,380px)]">
          <SelectValue placeholder="Select view" />
        </SelectTrigger>
        <SelectContent className="max-h-[min(80vh,28rem)]">
          <SelectItem value="all">All zones (aggregated)</SelectItem>
          {zones.map((z) => (
            <SelectGroup key={z.id}>
              <SelectLabel className="text-xs font-semibold text-muted-foreground">
                {z.name}
              </SelectLabel>
              <SelectItem value={z.id}>Whole zone</SelectItem>
              {z.nodeIds.map((nid) => (
                <SelectItem key={`${z.id}-${nid}`} value={toNodeFilterValue(nid)}>
                  Node {nid}
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
          {unassignedNodeIds.length > 0 ? (
            <>
              <SelectSeparator />
              <SelectGroup>
                <SelectLabel className="text-xs font-semibold text-muted-foreground">
                  Unassigned sensors
                </SelectLabel>
                {unassignedNodeIds.map((nid) => (
                  <SelectItem key={`un-${nid}`} value={toNodeFilterValue(nid)}>
                    Node {nid}
                  </SelectItem>
                ))}
              </SelectGroup>
            </>
          ) : null}
          <SelectSeparator />
          <SelectItem value="unassigned">All unassigned nodes</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
