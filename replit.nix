{pkgs}: {
  deps = [
    pkgs.postgresql
    pkgs.python3
    pkgs.python3Packages.pip
  ];
}
