interface CampaignIconsProps {
    icons: readonly string[];
    className?: string;
    iconClassName?: string;
}

export default function CampaignIcons({ icons, className = '', iconClassName = 'text-[22px]' }: CampaignIconsProps) {
    if (icons.length === 0) return null;

    return (
        <span className={`inline-flex items-center gap-0.5 ${className}`}>
            {icons.map((icon, index) => (
                <span key={`${icon}-${index}`} className={`material-symbols-outlined ${iconClassName}`}>
                    {icon}
                </span>
            ))}
        </span>
    );
}
