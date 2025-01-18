{pkgs}: {
  deps = [
    pkgs.python-launcher
    pkgs.postgresql
    pkgs.python3
    pkgs.python3Packages.pip
  ];
}
