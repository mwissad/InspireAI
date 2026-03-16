export default function DatabricksLogo({ className = 'w-8 h-8' }) {
  return (
    <svg
      className={className}
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Databricks geometric logo */}
      <path d="M18 0L35.32 10v4.22L18 24.44.68 14.22V10L18 0z" fill="#FF3621" />
      <path d="M18 11.78L35.32 21.78v4.22L18 36 .68 26V21.78L18 11.78z" fill="#FF3621" opacity="0.7" />
      <path d="M.68 14.22L18 24.44l17.32-10.22L18 4.22.68 14.22z" fill="#FF6A52" />
    </svg>
  );
}
