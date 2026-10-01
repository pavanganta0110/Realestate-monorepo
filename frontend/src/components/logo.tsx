import React from "react"

export const Logo = ({ className = "h-12 w-auto", ...props }) => {
  return (
    <div className={`flex min-w-0 items-center gap-3 ${className}`} {...props}>
      <svg 
        viewBox="0 0 100 100" 
        fill="none" 
        xmlns="http://www.w3.org/2000/svg" 
        className="h-full w-auto shrink-0"
      >
        {/* Established Professional Key Logo */}
        <circle cx="30" cy="50" r="22" stroke="currentColor" strokeWidth="6" />
        <circle cx="30" cy="50" r="8" fill="currentColor" />
        
        {/* Shaft */}
        <path d="M52 50 H90" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
        
        {/* Skyline as teeth */}
        <path d="M65 50 V35 H72 V50" fill="currentColor" opacity="0.8" />
        <path d="M75 50 V42 H82 V50" fill="currentColor" opacity="0.72" />
        <path d="M85 50 V30 H92 V50" fill="currentColor" />
      </svg>
      <div className="min-w-0 flex flex-col leading-none">
        <span className="truncate text-xl font-bold tracking-tight text-current uppercase font-heading">Coach Johnson</span>
        <span className="truncate text-[10px] font-bold tracking-[0.3em] text-current opacity-70 uppercase font-heading">Realty Group</span>
      </div>
    </div>
  )
}
