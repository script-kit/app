set -e

WD=$PWD
release_channel="${release_channel:="$(git rev-parse --abbrev-ref HEAD)"}"

echo "Release channel: $release_channel"
kit_dir="$WD/node_modules/@johnlindquist/kit"

echo "$release_channel" >| "$WD/assets/release_channel.txt"

# Into to $kit_dir
cd $kit_dir
kit_tar="$WD/assets/kit.tar.gz"
tar --exclude "./node_modules/*" --exclude "./node/*" --exclude "kit.sock" -cvzf "$kit_tar" ./

# Back to working dir
cd "$WD"
kenv_url="https://github.com/johnlindquist/kenv/tarball/$release_channel"
echo "Downloading $kenv_url"
curl -L $kenv_url  -o ./assets/kenv.tar.gz
