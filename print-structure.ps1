$outputFile = "project_source_dump.txt"

# Directories to exclude (non-developer / generated / cache)
$excludeDirs = @(
    "node_modules",
    ".turbo",
    ".vite",
    ".git",
    ".pnpm",
    "dist",
    "build",
    "coverage",
    "out",
    ".next",
    ".output",
    ".cache",
    ".vercel",
    ".idea",
    ".vscode",
    "prisma/migrations",
    "tmp",
    "temp",
    "logs"
)

# File extensions to exclude (binary / generated / static assets)
$excludeExtensions = @(
    ".woff", ".woff2",
    ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico",
    ".mp4", ".webm", ".mov",
    ".pdf",
    ".log",
    ".zip", ".tar", ".gz",
    ".tsbuildinfo",".txt",'.ps1','.tgz'
)

# Specific files to exclude
$excludeFiles = @(
    "project_source_dump.txt",
    "package-lock.json",
    "pnpm-lock.yaml",
    "yarn.lock",
    ".env",
    ".env.local",
    ".env.development",
    ".env.production",
    ".env.test",
    "tsconfig.tsbuildinfo",
    "README.md"
)

# Clear output file
New-Item -ItemType File -Path $outputFile -Force | Out-Null

# Get current directory dynamically
$rootPath = (Get-Location).Path

Get-ChildItem -Recurse -File | Sort-Object FullName | ForEach-Object {

    $fullPath = $_.FullName
    $relativePath = $fullPath.Replace("$rootPath\", "")

    # Skip excluded directories
    if ($excludeDirs | Where-Object { $relativePath -like "*$_*" }) { return }

    # Skip excluded extensions
    if ($excludeExtensions -contains $_.Extension) { return }

    # Skip excluded files
    if ($excludeFiles -contains $_.Name) { return }

    Add-Content -Path $outputFile -Value "`n--- START OF FILE: $relativePath ---`n"
    Get-Content -Path $fullPath | Add-Content -Path $outputFile
    Add-Content -Path $outputFile -Value "`n--- END OF FILE: $relativePath ---`n"
}

Write-Host "✅ Developer source dump written to $outputFile" -ForegroundColor Green
