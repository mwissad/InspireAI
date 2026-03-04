export default function DatabricksLogo({ className = 'w-8 h-8' }) {
  return (
    <svg
      className={className}
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Databricks "spark" logo */}
      <path
        d="M18 2L3 10.5V18L18 26.5L33 18V10.5L18 2Z"
        fill="#FF3621"
      />
      <path
        d="M18 26.5L3 18V25.5L18 34L33 25.5V18L18 26.5Z"
        fill="#FF3621"
        opacity="0.7"
      />
      <path
        d="M18 2L3 10.5L18 19L33 10.5L18 2Z"
        fill="#FF6A52"
      />
    </svg>
  );
}
