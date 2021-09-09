set -e

WD=$PWD
release_channel="${release_channel:="$(git rev-parse --abbrev-ref HEAD)"}"

echo "Release channel: $release_channel"

kit_dir=~/.kit

# Into to $kit_dir
cd $kit_dir
if [ -f $WD/assets/kit.zip ]; then
  rm $WD/assets/kit.zip
fi
zip -r "$WD/assets/kit.zip" ./ -x "./node_modules/*" -x "./node/*"

# Back to root
cd "$WD"

kenv_url="https://github.com/johnlindquist/kenv/archive/refs/heads/$release_channel.zip"
echo "Downloading $kenv_url"
curl -L $kenv_url  -o ./assets/kenv.zip
