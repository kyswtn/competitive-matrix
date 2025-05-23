{
  inputs = {
    flake-compat.url = "https://flakehub.com/f/edolstra/flake-compat/1.tar.gz";
    nixpkgs.url = "github:NixOS/nixpkgs/032bc6539bd5f14e9d0c51bd79cfe9a055b094c3";
  };

  outputs = { self, nixpkgs, ... }:
    let
      mkInputs = system: {
        pkgs = nixpkgs.legacyPackages.${system};
      };
      forAllSystems = fn:
        with nixpkgs.lib; attrsets.genAttrs systems.flakeExposed (system: fn (mkInputs system));
    in
    {
      devShells = forAllSystems (inputs: with inputs; {
        default = pkgs.mkShellNoCC {
          packages = [
            pkgs.bun
            pkgs.biome
          ];
        };
      });
    };
}
