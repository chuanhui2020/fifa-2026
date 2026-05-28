"use client";

interface FilterChipsProps {
  label: string;
  options: string[];
  selected: string | null;
  onSelect: (value: string | null) => void;
}

export function FilterChips({ label, options, selected, onSelect }: FilterChipsProps) {
  return (
    <div className="relative">
      <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide py-1 pr-6" role="group" aria-label={label}>
        <button
          onClick={() => onSelect(null)}
          className={`flex-shrink-0 px-4 min-h-[36px] py-1.5 rounded-lg text-xs font-medium transition-colors duration-150 cursor-pointer text-center ${
            selected === null
              ? "bg-upcoming text-white"
              : "bg-card text-muted border border-border active:bg-card-hover"
          }`}
        >
          全部
        </button>
        {options.map((option) => (
          <button
            key={option}
            onClick={() => onSelect(option === selected ? null : option)}
            className={`flex-shrink-0 px-4 min-h-[36px] py-1.5 rounded-lg text-xs font-medium transition-colors duration-150 cursor-pointer text-center ${
              selected === option
                ? "bg-upcoming text-white"
                : "bg-card text-muted border border-border active:bg-card-hover"
            }`}
          >
            {option}
          </button>
        ))}
      </div>
      <div className="absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-background to-transparent pointer-events-none" aria-hidden="true" />
    </div>
  );
}
