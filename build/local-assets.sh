set -e

WD=$PWD
release_channel="${release_channel:="$(git rev-parse --abbrev-ref HEAD)"}"

echo "Release channel: $release_channel"

kit_dir=~/.kit

# Into to $kit_dir
cd $kit_dir
kit_tar="$WD/assets/kit.tar.gz"
if [ -f $kit_tar ]; then
  rm $kit_tar
fi
# tar --exclude "./node_modules/*" --exclude "./node/*" --exclude "kit.sock" -cvzf "$kit_tar" ./
tar --exclude "kit.sock" -cvzf "$kit_tar" ./

echo "dev" >|"$WD/assets/release_channel.txt"

# Back to root
cd "$WD"

kenv_url="https://github.com/johnlindquist/kenv/tarball/$release_channel"
echo "Downloading $kenv_url"
curl -L $kenv_url -o ./assets/kenv.tar.gz
