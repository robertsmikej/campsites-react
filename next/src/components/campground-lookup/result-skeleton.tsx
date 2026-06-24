import { LoadingGhostRow } from "@/components/field-notes/loading";

export function ResultSkeleton() {
    return (
        <div className="bg-cw-cream border-[1.5px] border-cw-rule py-[22px] px-[26px] flex flex-col gap-3">
            <LoadingGhostRow height={12} className="w-[40%]" />
            <LoadingGhostRow height={22} className="w-[70%]" />
            <LoadingGhostRow height={12} className="w-[55%]" />
        </div>
    );
}
