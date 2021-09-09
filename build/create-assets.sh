set -e

WD=$PWD
release_channel="${release_channel:="$(git rev-parse --abbrev-ref HEAD)"}"

echo "Release channel: $release_channel"
kit_dir="$WD/node_modules/@johnlindquist/kit"

echo "$release_channel" >| "$WD/assets/release_channel.txt"

# Into to $kit_dir
cd $kit_dir
zip -r "$WD/assets/kit.zip" ./ -x "./node_modules/*" -x "./node/*"

# Back to working dir
cd "$WD"
kenv_url="https://github.com/johnlindquist/kenv/archive/refs/heads/$release_channel.zip"
echo "Downloading $kenv_url"
curl -L $kenv_url  -o ./assets/kenv.zip
